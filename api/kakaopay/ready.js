import {
  buildCorsHeaders,
  buildKakaoRequest,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
  validateKakaoRuntimeConfig,
  validateKakaoSubscriptionConfig,
  validateKakaoReadyUrls,
} from "../../lib/payments/kakaopay.js";
import { authenticateSupabaseUserFromRequest, resolvePaidTierPricing } from "../../lib/billing/tier-sync.js";
import { getProTrialStatus, PRO_TRIAL_DAYS, PRO_TRIAL_TIER } from "../../lib/billing/pro-trial.js";

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const buildPublicPaymentMessage = (statusCode, fallback = "결제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.") => {
  const status = Number(statusCode);
  if (status === 401) return "로그인이 필요합니다.";
  if (status === 403) return "요청을 처리할 수 없습니다.";
  if (status === 400 || status === 404 || status === 409) return fallback;
  return "결제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.";
};

export default async function handler(req, res) {
  const {
    secretKey,
    cid,
    subscriptionCid,
    apiBase,
    authScheme,
    readyPath,
    clientOrigin,
    allowOrigin,
  } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  if (!secretKey) {
    sendJson(res, 500, { message: buildPublicPaymentMessage(500) }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const requestedTier = String(body?.tier || body?.planTier || "").trim().toLowerCase();
  const requestedMonths = normalizePositiveInteger(body?.billingMonths ?? body?.months, 1) || 1;
  const orderId = String(body?.orderId || "").trim();
  const itemName = String(body?.itemName || body?.plan || "KakaoPay Plan").trim() || "KakaoPay Plan";
  const registerSubscription =
    body?.registerSubscription === true || String(body?.paymentMode || "").trim().toLowerCase() === "subscription";
  const isProTrialRegistration =
    registerSubscription &&
    body?.proTrial === true &&
    requestedTier === PRO_TRIAL_TIER;
  const pricing = isProTrialRegistration
    ? { ok: true, tier: requestedTier, months: 1, amount: 0 }
    : resolvePaidTierPricing({
        requestedTier,
        requestedMonths,
      });
  const amount = isProTrialRegistration ? 0 : normalizeNonNegativeInteger(pricing.amount);
  const quantity = 1;
  const vatAmount = Math.floor(amount / 11);
  const taxFreeAmount = 0;
  const approvalUrl = String(body?.approvalUrl || `${clientOrigin}/?kakaoPay=approve`).trim();
  const cancelUrl = String(body?.cancelUrl || `${clientOrigin}/?kakaoPay=cancel`).trim();
  const failUrl = String(body?.failUrl || `${clientOrigin}/?kakaoPay=fail`).trim();

  if (!registerSubscription) {
    sendJson(res, 400, { message: "One-time KakaoPay payments are disabled. Use subscription billing only." }, allowOrigin);
    return;
  }

  const configError = validateKakaoRuntimeConfig({
    secretKey,
    cid,
    apiBase,
    requireCid: !registerSubscription,
  });
  if (configError) {
    sendJson(res, 500, { message: buildPublicPaymentMessage(500) }, allowOrigin);
    return;
  }

  if (!pricing.ok) {
    sendJson(res, pricing.status, { message: pricing.message }, allowOrigin);
    return;
  }

  if (!orderId || !requestedTier || (!isProTrialRegistration && amount <= 0) || (isProTrialRegistration && amount < 0)) {
    sendJson(res, 400, { message: "tier and orderId are required." }, allowOrigin);
    return;
  }

  const readyUrlError = validateKakaoReadyUrls({
    secretKey,
    apiBase,
    approvalUrl,
    cancelUrl,
    failUrl,
  });
  if (readyUrlError) {
    sendJson(res, 400, { message: buildPublicPaymentMessage(400) }, allowOrigin);
    return;
  }

  const subscriptionConfigError = validateKakaoSubscriptionConfig({
    secretKey,
    subscriptionCid,
    apiBase,
  });
  if (subscriptionConfigError) {
    sendJson(res, 500, { message: buildPublicPaymentMessage(500) }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: buildPublicPaymentMessage(authResult.status) }, allowOrigin);
    return;
  }
  const authenticatedUserId = authResult.userId;

  if (isProTrialRegistration) {
    try {
      const trialStatus = await getProTrialStatus({ authResult });
      if (!trialStatus.eligible) {
        const message = trialStatus.claimedAt
          ? `Pro 무료 ${PRO_TRIAL_DAYS}일 체험은 이미 사용했습니다.`
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }
    } catch (error) {
      sendJson(res, 500, { message: buildPublicPaymentMessage(500) }, allowOrigin);
      return;
    }
  }

  const requestPayload = {
    cid: registerSubscription ? subscriptionCid : cid,
    partner_order_id: orderId,
    partner_user_id: authenticatedUserId,
    item_name: itemName,
    quantity: String(quantity),
    total_amount: String(amount),
    vat_amount: String(vatAmount),
    tax_free_amount: String(taxFreeAmount),
    approval_url: approvalUrl,
    cancel_url: cancelUrl,
    fail_url: failUrl,
  };
  const requestOptions = buildKakaoRequest({
    authScheme,
    secretKey,
    path: readyPath,
    payload: requestPayload,
  });

  try {
    const response = await fetch(makeKakaoApiUrl(apiBase, readyPath), {
      method: "POST",
      headers: requestOptions.headers,
      body: requestOptions.body,
    });

    const data = await parseApiResponse(response);
    if (!response.ok) {
      sendJson(res, response.status, { message: buildPublicPaymentMessage(response.status) }, allowOrigin);
      return;
    }

    sendJson(
      res,
      200,
      {
        ...data,
        paymentMode: "subscription",
        cid: requestPayload.cid,
      },
      allowOrigin
    );
  } catch (error) {
    console.error("KakaoPay ready failed", error);
    sendJson(res, 500, { message: buildPublicPaymentMessage(500) }, allowOrigin);
  }
}
