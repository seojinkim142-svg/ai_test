import {
  buildCorsHeaders,
  buildNiceSignature,
  formatNiceEdiDate,
  getRuntimeConfig,
  parseRequestBody,
  requestNiceBillingApi,
  safeEqual,
  sendJson,
  sha256Hex,
  validateNiceBillingConfig,
  verifyPaymentToken,
} from "../../nicepayments.js";
import { getSupabaseAdminClient, syncPaidTierForUserId } from "../../../billing/tier-sync.js";
import {
  getProTrialStatus,
  grantProTrialTier,
  markProTrialClaimed,
  PRO_TRIAL_RECURRING_AMOUNT,
  PRO_TRIAL_TIER,
} from "../../../billing/pro-trial.js";
import {
  fetchNiceSubscriptionByUserId,
  markNiceSubscriptionInactive,
  upsertNiceSubscriptionRegistration,
} from "../../../billing/nice-subscription-store.js";

const REGISTER_PATH = "/webapi/billing/cardbill_regist.jsp";
const CHARGE_PATH = "/webapi/billing/billing_approve.jsp";
const REMOVE_PATH = "/webapi/billing/billkey_remove.jsp";

const text = (value) => String(value ?? "").trim();

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const createBillingTid = (prefix = "nice_sub") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toIsoFromNiceDate = (value) => {
  const raw = text(value).replace(/\D+/g, "");
  if (raw.length !== 14) return null;
  const yyyy = raw.slice(0, 4);
  const mm = raw.slice(4, 6);
  const dd = raw.slice(6, 8);
  const hh = raw.slice(8, 10);
  const mi = raw.slice(10, 12);
  const ss = raw.slice(12, 14);
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const redirectToNiceBillingClient = (res, clientOrigin, params) => {
  let location;
  try {
    const target = new URL(clientOrigin || "http://localhost:5173");
    if (params.state) target.searchParams.set("niceBilling", params.state);
    if (params.trial) target.searchParams.set("trial", params.trial);
    if (params.message) target.searchParams.set("message", params.message);
    if (params.orderId) target.searchParams.set("orderId", params.orderId);
    if (params.amount != null) target.searchParams.set("amount", String(params.amount));
    location = target.toString();
  } catch {
    location = "http://localhost:5173";
  }

  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
};

const failAndRedirect = (res, clientOrigin, message) => {
  redirectToNiceBillingClient(res, clientOrigin, {
    state: "fail",
    message,
  });
};

const requestBillingRemove = async ({ billingApiBase, billingMid, billingMerchantKey, bid, amount }) => {
  const ediDate = formatNiceEdiDate();
  const moid = createBillingTid("nice_sub_inactive");
  return requestNiceBillingApi({
    apiBase: billingApiBase,
    path: REMOVE_PATH,
    payload: {
      BID: bid,
      MID: billingMid,
      EdiDate: ediDate,
      Moid: moid,
      Amt: String(normalizePositiveInteger(amount, 0)),
      SignData: sha256Hex(billingMid, ediDate, moid, bid, billingMerchantKey),
      CharSet: "utf-8",
      EdiType: "JSON",
    },
  });
};

export default async function handler(req, res) {
  const {
    allowOrigin,
    clientOrigin,
    billingMid,
    billingMerchantKey,
    billingApiBase,
  } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...buildCorsHeaders(allowOrigin),
    });
    res.end(
      [
        "NICEPAYMENTS subscription return endpoint is running.",
        `clientOrigin=${clientOrigin}`,
        `billingApiBase=${billingApiBase}`,
      ].join("\n")
    );
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const configError = validateNiceBillingConfig({
    billingMid,
    billingMerchantKey,
    billingApiBase,
  });
  if (configError) {
    failAndRedirect(res, clientOrigin, configError);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    failAndRedirect(res, clientOrigin, "Invalid return payload.");
    return;
  }

  const authResultCode = text(body.AuthResultCode || body.authResultCode || body.resultCode);
  const authResultMsg = text(body.AuthResultMsg || body.authResultMsg || body.resultMsg);
  if (authResultCode !== "0000") {
    failAndRedirect(res, clientOrigin, authResultMsg || "Subscription billing authorization failed.");
    return;
  }

  const txTid = text(body.TxTid || body.tid);
  const authToken = text(body.AuthToken || body.authToken);
  const amount = text(body.Amt || body.amount);
  const signature = text(body.Signature || body.signature);
  const responseMid = text(body.MID || body.mid || billingMid);
  const reservedToken = text(body.ReqReserved || body.reqReserved);

  if (!txTid || !authToken || !amount || !signature || !reservedToken) {
    failAndRedirect(res, clientOrigin, "Required subscription billing fields are missing.");
    return;
  }

  if (responseMid !== billingMid) {
    failAndRedirect(res, clientOrigin, "Billing MID does not match.");
    return;
  }

  const expectedSignature = buildNiceSignature({
    authToken,
    clientId: billingMid,
    amount,
    secretKey: billingMerchantKey,
  });
  if (!safeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) {
    failAndRedirect(res, clientOrigin, "Subscription billing signature verification failed.");
    return;
  }

  const requestPayload = verifyPaymentToken(reservedToken, billingMerchantKey);
  if (!requestPayload || text(requestPayload?.flow) !== "nice_subscription") {
    failAndRedirect(res, clientOrigin, "Subscription request token is invalid or expired.");
    return;
  }

  const userId = text(requestPayload.userId);
  const orderId = text(requestPayload.orderId);
  const itemName = text(requestPayload.itemName || "NicePayments Subscription");
  const requestedTier = text(requestPayload.tier).toLowerCase();
  const billingMonths = normalizePositiveInteger(requestPayload.billingMonths, 1) || 1;
  const amountNumber = normalizePositiveInteger(requestPayload.amount, 0);
  const recurringAmount = normalizePositiveInteger(
    requestPayload.chargeAmount,
    requestedTier === PRO_TRIAL_TIER ? PRO_TRIAL_RECURRING_AMOUNT : amountNumber
  );
  const isProTrial = requestPayload.proTrial === true && requestedTier === PRO_TRIAL_TIER;

  if (!userId || !orderId || !requestedTier || !amountNumber) {
    failAndRedirect(res, clientOrigin, "Subscription request payload is invalid.");
    return;
  }

  const registerEdiDate = formatNiceEdiDate();
  const registerResult = await requestNiceBillingApi({
    apiBase: billingApiBase,
    path: REGISTER_PATH,
    payload: {
      TID: txTid,
      AuthToken: authToken,
      MID: billingMid,
      EdiDate: registerEdiDate,
      SignData: sha256Hex(txTid, billingMid, registerEdiDate, billingMerchantKey),
      CharSet: "utf-8",
      EdiType: "JSON",
    },
  });

  const registerCode = text(registerResult?.data?.ResultCode);
  if (!registerResult.ok || registerCode !== "F100") {
    const message =
      text(registerResult?.data?.ResultMsg) ||
      text(registerResult?.data?.message) ||
      "Bill key registration failed.";
    failAndRedirect(res, clientOrigin, message);
    return;
  }

  const bid = text(registerResult?.data?.BID);
  if (!bid) {
    failAndRedirect(res, clientOrigin, "Bill key registration did not return BID.");
    return;
  }

  if (isProTrial) {
    let warningMessage = "";
    let savedSubscription = null;
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      failAndRedirect(res, clientOrigin, "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
      return;
    }

    const trialAuthResult = {
      client: adminClient,
      userId,
    };

    try {
      const trialStatus = await getProTrialStatus({ authResult: trialAuthResult });
      if (!trialStatus.eligible) {
        await requestBillingRemove({
          billingApiBase,
          billingMid,
          billingMerchantKey,
          bid,
          amount: recurringAmount,
        }).catch(() => {});

        const message = trialStatus.claimedAt
          ? "Pro 무료 1개월 체험은 이미 사용했습니다."
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        failAndRedirect(res, clientOrigin, message);
        return;
      }

      const currentSubscription = await fetchNiceSubscriptionByUserId({
        userId,
        includeInactive: true,
      });

      if (
        currentSubscription?.status === "active" &&
        text(currentSubscription?.sid) &&
        text(currentSubscription.sid) !== bid
      ) {
        const inactiveResult = await requestBillingRemove({
          billingApiBase,
          billingMid: text(currentSubscription.cid || billingMid),
          billingMerchantKey,
          bid: text(currentSubscription.sid),
          amount: normalizePositiveInteger(currentSubscription.amount, recurringAmount),
        });

        if (inactiveResult.ok && text(inactiveResult?.data?.ResultCode) === "F101") {
          await markNiceSubscriptionInactive({
            userId,
            reason: "replaced_by_pro_trial_subscription",
            rawInactive: inactiveResult.data,
          });
        } else {
          warningMessage =
            text(inactiveResult?.data?.ResultMsg) || "Previous NICE subscription could not be inactivated automatically.";
        }
      }

      const approvedAtIso = toIsoFromNiceDate(registerResult?.data?.AuthDate) || new Date().toISOString();
      savedSubscription = await upsertNiceSubscriptionRegistration({
        userId,
        bid,
        mid: billingMid,
        tier: requestedTier,
        billingMonths: 1,
        amount: recurringAmount,
        itemName,
        orderId,
        tid: txTid,
        approvedAt: approvedAtIso,
        rawApprove: registerResult.data,
        rawCharge: null,
        metadata: {
          paymentMode: "subscription",
          proTrial: true,
          cardCode: text(registerResult?.data?.CardCode),
          cardName: text(registerResult?.data?.CardName),
          cardNo: text(registerResult?.data?.CardNo),
        },
      });

      const grantResult = await grantProTrialTier({ userId });
      if (!grantResult.ok) {
        await requestBillingRemove({
          billingApiBase,
          billingMid,
          billingMerchantKey,
          bid,
          amount: recurringAmount,
        }).catch(() => {});
        if (savedSubscription) {
          await markNiceSubscriptionInactive({
            userId,
            reason: "pro_trial_grant_failed",
            rawInactive: {
              message: grantResult.message,
            },
          }).catch(() => {});
        }

        failAndRedirect(res, clientOrigin, grantResult.message || "Pro 무료 체험 시작에 실패했습니다.");
        return;
      }

      try {
        const claimResult = await markProTrialClaimed({
          authResult: trialAuthResult,
          user: trialStatus.user,
        });
        if (!claimResult?.claimedAt) {
          warningMessage = warningMessage
            ? `${warningMessage} Pro trial claim state could not be confirmed.`
            : "Pro trial claim state could not be confirmed.";
        }
      } catch (claimError) {
        warningMessage = warningMessage
          ? `${warningMessage} ${claimError.message}`
          : claimError.message;
      }

      redirectToNiceBillingClient(res, clientOrigin, {
        state: "success",
        trial: "1",
        orderId,
        amount: recurringAmount,
        message: warningMessage,
      });
      return;
    } catch (error) {
      await requestBillingRemove({
        billingApiBase,
        billingMid,
        billingMerchantKey,
        bid,
        amount: recurringAmount,
      }).catch(() => {});
      if (savedSubscription) {
        await markNiceSubscriptionInactive({
          userId,
          reason: "pro_trial_setup_failed",
          rawInactive: {
            message: error.message,
          },
        }).catch(() => {});
      }
      failAndRedirect(res, clientOrigin, error.message || "Pro 무료 체험 등록에 실패했습니다.");
      return;
    }
  }

  const chargeTid = createBillingTid("nice_sub_charge");
  const chargeEdiDate = formatNiceEdiDate();
  const chargeResult = await requestNiceBillingApi({
    apiBase: billingApiBase,
    path: CHARGE_PATH,
    payload: {
      BID: bid,
      MID: billingMid,
      EdiDate: chargeEdiDate,
      TID: chargeTid,
      Moid: orderId,
      Amt: String(amountNumber),
      GoodsName: itemName,
      CardQuota: "00",
      SignData: sha256Hex(billingMid, chargeEdiDate, orderId, amountNumber, bid, billingMerchantKey),
      CharSet: "utf-8",
      EdiType: "JSON",
    },
  });

  const chargeCode = text(chargeResult?.data?.ResultCode);
  if (!chargeResult.ok || chargeCode !== "3001") {
    await requestBillingRemove({
      billingApiBase,
      billingMid,
      billingMerchantKey,
      bid,
      amount: amountNumber,
    }).catch(() => {});

    const message =
      text(chargeResult?.data?.ResultMsg) ||
      text(chargeResult?.data?.message) ||
      "First recurring payment approval failed.";
    failAndRedirect(res, clientOrigin, message);
    return;
  }

  let warningMessage = "";

  try {
    const currentSubscription = await fetchNiceSubscriptionByUserId({
      userId,
      includeInactive: true,
    });

    if (
      currentSubscription?.status === "active" &&
      text(currentSubscription?.sid) &&
      text(currentSubscription.sid) !== bid
    ) {
      const inactiveResult = await requestBillingRemove({
        billingApiBase,
        billingMid: text(currentSubscription.cid || billingMid),
        billingMerchantKey,
        bid: text(currentSubscription.sid),
        amount: normalizePositiveInteger(currentSubscription.amount, amountNumber),
      });

      if (inactiveResult.ok && text(inactiveResult?.data?.ResultCode) === "F101") {
        await markNiceSubscriptionInactive({
          userId,
          reason: "replaced_by_new_subscription",
          rawInactive: inactiveResult.data,
        });
      } else {
        warningMessage =
          text(inactiveResult?.data?.ResultMsg) || "Previous NICE subscription could not be inactivated automatically.";
      }
    }

    await upsertNiceSubscriptionRegistration({
      userId,
      bid,
      mid: billingMid,
      tier: requestedTier,
      billingMonths,
      amount: amountNumber,
      itemName,
      orderId,
      tid: text(chargeResult?.data?.TID || chargeTid),
      approvedAt: toIsoFromNiceDate(chargeResult?.data?.AuthDate) || new Date().toISOString(),
      rawApprove: registerResult.data,
      rawCharge: chargeResult.data,
      metadata: {
        paymentMode: "subscription",
        cardCode: text(chargeResult?.data?.CardCode || registerResult?.data?.CardCode),
        cardName: text(chargeResult?.data?.CardName || registerResult?.data?.CardName),
        cardNo: text(chargeResult?.data?.CardNo || registerResult?.data?.CardNo),
      },
    });

    const tierSync = await syncPaidTierForUserId({
      userId,
      amount: amountNumber,
      requestedTier,
      requestedMonths: billingMonths,
    });
    if (!tierSync.ok) {
      warningMessage = warningMessage
        ? `${warningMessage} ${tierSync.message}`
        : tierSync.message || "Tier sync failed after recurring payment.";
    }
  } catch (error) {
    warningMessage = warningMessage
      ? `${warningMessage} ${error.message}`
      : `Recurring payment completed but local save failed: ${error.message}`;
  }

  redirectToNiceBillingClient(res, clientOrigin, {
    state: "success",
    orderId,
    amount: amountNumber,
    message: warningMessage,
  });
}
