import {
  buildCorsHeaders,
  encryptNiceSubscribeCardData,
  formatNiceIsoDate,
  getRuntimeConfig,
  parseRequestBody,
  requestNiceSubscribeApi,
  sendJson,
  sha256Hex,
  validateNiceSubscribeConfig,
} from "../../nicepayments.js";
import { authenticateSupabaseUserFromRequest, getSupabaseAdminClient, syncPaidTierForUserId } from "../../../billing/tier-sync.js";
import {
  getProTrialStatus,
  grantProTrialTier,
  markProTrialClaimed,
  PRO_TRIAL_RECURRING_AMOUNT,
  PRO_TRIAL_TIER,
} from "../../../billing/pro-trial.js";
import {
  buildPublicNiceSubscription,
  fetchNiceSubscriptionByUserId,
  markNiceSubscriptionInactive,
  upsertNiceSubscriptionRegistration,
} from "../../../billing/nice-subscription-store.js";

const REGIST_PATH = "/v1/subscribe/regist";
const text = (value) => String(value ?? "").trim();
const digitsOnly = (value) => text(value).replace(/\D+/g, "");

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const createOrderId = (prefix = "nice_sub") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeNiceTimestamp = (value) => {
  const raw = text(value);
  if (!raw || raw === "0") return null;

  if (/^\d{8}$/.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00+09:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (/^\d{14}$/.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+09:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getResultCode = (data = {}) => text(data?.resultCode || data?.ResultCode);
const getResultMessage = (data = {}) => text(data?.resultMsg || data?.ResultMsg || data?.message || data?.msg || data?.error);
const getResponseBid = (data = {}) => text(data?.bid || data?.BID);
const getResponseTid = (data = {}) => text(data?.tid || data?.TID);

const buildSubscribePath = (bid, suffix = "payments") => `/v1/subscribe/${encodeURIComponent(text(bid))}/${suffix}`;

const verifyChargeSignature = ({ response, secretKey }) => {
  const signature = text(response?.signature);
  if (!signature) return true;

  const tid = text(response?.tid);
  const amount = normalizePositiveInteger(response?.amount, 0);
  const ediDate = text(response?.ediDate);
  if (!tid || !amount || !ediDate) return false;

  return signature.toLowerCase() === sha256Hex(tid, amount, ediDate, secretKey).toLowerCase();
};

const requestBidExpire = async ({ subscribeApiBase, clientId, secretKey, bid }) => {
  const orderId = createOrderId("nice_sub_expire");
  const ediDate = formatNiceIsoDate();
  return requestNiceSubscribeApi({
    apiBase: subscribeApiBase,
    path: buildSubscribePath(bid, "expire"),
    payload: {
      orderId,
      ediDate,
      signData: sha256Hex(orderId, bid, ediDate, secretKey),
      returnCharSet: "utf-8",
    },
    clientId,
    secretKey,
  });
};

const replaceExistingSubscriptionIfNeeded = async ({
  currentSubscription,
  newBid,
  userId,
  clientId,
  secretKey,
  subscribeApiBase,
  reason,
}) => {
  if (
    currentSubscription?.status !== "active" ||
    !text(currentSubscription?.sid) ||
    text(currentSubscription?.sid) === text(newBid)
  ) {
    return "";
  }

  const expireResult = await requestBidExpire({
    subscribeApiBase,
    clientId: text(currentSubscription?.cid || clientId),
    secretKey,
    bid: text(currentSubscription.sid),
  });

  if (expireResult.ok && getResultCode(expireResult?.data) === "0000") {
    await markNiceSubscriptionInactive({
      userId,
      reason,
      rawInactive: expireResult.data,
    });
    return "";
  }

  return getResultMessage(expireResult?.data) || "Previous NICE subscription could not be inactivated automatically.";
};

const validateCardPayload = ({ cardNumber, expiryYear, expiryMonth, birth, cardPassword }) => {
  if (cardNumber.length < 14 || cardNumber.length > 19) {
    return "카드번호를 다시 확인해주세요.";
  }
  if (!/^\d{2}$/.test(expiryYear)) {
    return "카드 유효기간 연도는 두 자리로 입력해주세요.";
  }
  if (!/^\d{2}$/.test(expiryMonth)) {
    return "카드 유효기간 월은 두 자리로 입력해주세요.";
  }
  const month = Number(expiryMonth);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return "카드 유효기간 월이 올바르지 않습니다.";
  }
  if (!(birth.length === 6 || birth.length === 10)) {
    return "생년월일 6자리 또는 사업자번호 10자리를 입력해주세요.";
  }
  if (!/^\d{2}$/.test(cardPassword)) {
    return "카드 비밀번호 앞 두 자리를 입력해주세요.";
  }
  return "";
};

export default async function handler(req, res) {
  const { allowOrigin, clientId, secretKey, subscribeApiBase } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const configError = validateNiceSubscribeConfig({
    clientId,
    secretKey,
    apiBase: subscribeApiBase,
  });
  if (configError) {
    sendJson(res, 500, { message: configError }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  const requestedTier = text(body?.tier || body?.planTier).toLowerCase();
  const isProTrial = body?.proTrial === true && requestedTier === PRO_TRIAL_TIER;
  const requestedAmount = normalizePositiveInteger(body?.amount, 0);
  const amount = isProTrial
    ? normalizePositiveInteger(body?.amount, PRO_TRIAL_RECURRING_AMOUNT) || PRO_TRIAL_RECURRING_AMOUNT
    : requestedAmount;
  const billingMonths = normalizePositiveInteger(body?.billingMonths ?? body?.months, 1) || 1;
  const itemName = text(body?.itemName || body?.orderName || body?.goodsName || "NicePayments Subscription");
  const orderId = text(body?.orderId) || createOrderId();
  const buyerName = text(body?.buyerName || body?.name || authResult.userId.slice(0, 8));
  const buyerEmail = text(body?.buyerEmail || body?.email || "");
  const buyerTel = digitsOnly(body?.buyerTel || body?.phone || "");

  const cardNumber = digitsOnly(body?.cardNumber || body?.cardNo);
  const expiryYear = digitsOnly(body?.expiryYear || body?.expYear).slice(-2);
  const expiryMonth = digitsOnly(body?.expiryMonth || body?.expMonth).padStart(2, "0").slice(-2);
  const birth = digitsOnly(body?.birth || body?.idNo);
  const cardPassword = digitsOnly(body?.cardPassword || body?.cardPw).slice(0, 2);

  if (!amount || !requestedTier) {
    sendJson(res, 400, { message: "amount and tier are required." }, allowOrigin);
    return;
  }

  const cardPayloadError = validateCardPayload({
    cardNumber,
    expiryYear,
    expiryMonth,
    birth,
    cardPassword,
  });
  if (cardPayloadError) {
    sendJson(res, 400, { message: cardPayloadError }, allowOrigin);
    return;
  }

  if (isProTrial) {
    try {
      const trialStatus = await getProTrialStatus({ authResult });
      if (!trialStatus.eligible) {
        const message = trialStatus.claimedAt
          ? "Pro 무료 1개월 체험은 이미 사용하셨습니다."
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Pro trial status lookup failed." }, allowOrigin);
      return;
    }
  }

  const encData = encryptNiceSubscribeCardData({
    secretKey,
    cardNumber,
    expYear: expiryYear,
    expMonth: expiryMonth,
    idNo: birth,
    cardPassword,
  });

  const registEdiDate = formatNiceIsoDate();
  const registResult = await requestNiceSubscribeApi({
    apiBase: subscribeApiBase,
    path: REGIST_PATH,
    payload: {
      encData,
      orderId,
      buyerName,
      buyerEmail,
      buyerTel,
      ediDate: registEdiDate,
      signData: sha256Hex(orderId, registEdiDate, secretKey),
      returnCharSet: "utf-8",
    },
    clientId,
    secretKey,
  });

  if (!registResult.ok || getResultCode(registResult?.data) !== "0000") {
    sendJson(
      res,
      registResult.status || 500,
      { message: getResultMessage(registResult?.data) || "Bill key registration failed." },
      allowOrigin
    );
    return;
  }

  const bid = getResponseBid(registResult?.data);
  if (!bid) {
    sendJson(res, 500, { message: "Bill key registration did not return BID." }, allowOrigin);
    return;
  }

  const currentSubscription = await fetchNiceSubscriptionByUserId({
    userId: authResult.userId,
    includeInactive: true,
  });

  if (isProTrial) {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
      sendJson(
        res,
        500,
        { message: "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
        allowOrigin
      );
      return;
    }

    const trialAuthResult = {
      client: adminClient,
      userId: authResult.userId,
    };

    let savedSubscription = null;
    let warningMessage = "";

    try {
      const trialStatus = await getProTrialStatus({ authResult: trialAuthResult });
      if (!trialStatus.eligible) {
        await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
        const message = trialStatus.claimedAt
          ? "Pro 무료 1개월 체험은 이미 사용하셨습니다."
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }

      warningMessage = await replaceExistingSubscriptionIfNeeded({
        currentSubscription,
        newBid: bid,
        userId: authResult.userId,
        clientId,
        secretKey,
        subscribeApiBase,
        reason: "replaced_by_pro_trial_subscription",
      });

      const approvedAt = normalizeNiceTimestamp(registResult?.data?.AuthDate) || new Date().toISOString();
      savedSubscription = await upsertNiceSubscriptionRegistration({
        userId: authResult.userId,
        bid,
        mid: clientId,
        tier: requestedTier,
        billingMonths: 1,
        amount: PRO_TRIAL_RECURRING_AMOUNT,
        itemName,
        orderId,
        tid: getResponseTid(registResult?.data),
        approvedAt,
        rawApprove: registResult.data,
        rawCharge: null,
        metadata: {
          paymentMode: "subscription",
          registrationMode: "rest-billing",
          proTrial: true,
          cardCode: text(registResult?.data?.CardCode),
          cardName: text(registResult?.data?.CardName),
        },
      });

      const grantResult = await grantProTrialTier({ userId: authResult.userId });
      if (!grantResult.ok) {
        await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
        await markNiceSubscriptionInactive({
          userId: authResult.userId,
          reason: "pro_trial_grant_failed",
          rawInactive: { message: grantResult.message },
        }).catch(() => {});
        sendJson(res, 500, { message: grantResult.message || "Pro trial start failed." }, allowOrigin);
        return;
      }

      try {
        await markProTrialClaimed({
          authResult: trialAuthResult,
          user: trialStatus.user,
        });
      } catch (claimError) {
        warningMessage = warningMessage ? `${warningMessage} ${claimError.message}` : claimError.message;
      }

      sendJson(
        res,
        200,
        {
          ok: true,
          trialStarted: true,
          tierUpdated: true,
          message: warningMessage,
          subscription: buildPublicNiceSubscription(savedSubscription),
        },
        allowOrigin
      );
      return;
    } catch (error) {
      await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
      if (savedSubscription) {
        await markNiceSubscriptionInactive({
          userId: authResult.userId,
          reason: "pro_trial_setup_failed",
          rawInactive: { message: error.message },
        }).catch(() => {});
      }
      sendJson(res, 500, { message: error.message || "Pro trial setup failed." }, allowOrigin);
      return;
    }
  }

  const chargeEdiDate = formatNiceIsoDate();
  const chargeResult = await requestNiceSubscribeApi({
    apiBase: subscribeApiBase,
    path: buildSubscribePath(bid, "payments"),
    payload: {
      orderId,
      amount,
      goodsName: itemName,
      cardQuota: 0,
      useShopInterest: false,
      buyerName,
      buyerEmail,
      buyerTel,
      ediDate: chargeEdiDate,
      signData: sha256Hex(orderId, bid, chargeEdiDate, secretKey),
      returnCharSet: "utf-8",
    },
    clientId,
    secretKey,
  });

  if (!chargeResult.ok || getResultCode(chargeResult?.data) !== "0000") {
    await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
    sendJson(
      res,
      chargeResult.status || 500,
      { message: getResultMessage(chargeResult?.data) || "First recurring payment approval failed." },
      allowOrigin
    );
    return;
  }

  if (!verifyChargeSignature({ response: chargeResult?.data, secretKey })) {
    await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
    sendJson(res, 500, { message: "Subscription payment signature verification failed." }, allowOrigin);
    return;
  }

  try {
    const warningMessage = await replaceExistingSubscriptionIfNeeded({
      currentSubscription,
      newBid: bid,
      userId: authResult.userId,
      clientId,
      secretKey,
      subscribeApiBase,
      reason: "replaced_by_new_subscription",
    });

    const savedSubscription = await upsertNiceSubscriptionRegistration({
      userId: authResult.userId,
      bid,
      mid: clientId,
      tier: requestedTier,
      billingMonths,
      amount,
      itemName,
      orderId,
      tid: getResponseTid(chargeResult?.data),
      approvedAt: normalizeNiceTimestamp(chargeResult?.data?.paidAt) || new Date().toISOString(),
      rawApprove: registResult.data,
      rawCharge: chargeResult.data,
      metadata: {
        paymentMode: "subscription",
        registrationMode: "rest-billing",
        cardCode: text(chargeResult?.data?.card?.cardCode || registResult?.data?.CardCode),
        cardName: text(chargeResult?.data?.card?.cardName || registResult?.data?.CardName),
        cardNo: text(chargeResult?.data?.card?.cardNum || ""),
      },
    });

    const tierSync = await syncPaidTierForUserId({
      userId: authResult.userId,
      amount,
      requestedTier,
      requestedMonths: billingMonths,
    });

    sendJson(
      res,
      200,
      {
        ok: true,
        charged: true,
        tierUpdated: Boolean(tierSync?.ok),
        tier: tierSync?.tier || requestedTier,
        tierExpiresAt: tierSync?.tierExpiresAt || null,
        message: warningMessage || (tierSync?.ok ? "" : tierSync?.message || ""),
        subscription: buildPublicNiceSubscription(savedSubscription),
      },
      allowOrigin
    );
  } catch (error) {
    await requestBidExpire({ subscribeApiBase, clientId, secretKey, bid }).catch(() => {});
    sendJson(res, 500, { message: error.message || "Subscription registration failed." }, allowOrigin);
  }
}
