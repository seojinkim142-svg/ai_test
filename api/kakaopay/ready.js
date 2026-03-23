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
import { authenticateSupabaseUserFromRequest } from "../../lib/billing/tier-sync.js";
import { getProTrialStatus, PRO_TRIAL_TIER } from "../../lib/billing/pro-trial.js";

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
    sendJson(res, 500, { message: "KAKAOPAY_SECRET_KEY (or KAKAOPAY_ADMIN_KEY) is not set." }, allowOrigin);
    return;
  }

  const configError = validateKakaoRuntimeConfig({ secretKey, cid, apiBase });
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

  const requestedTier = String(body?.tier || body?.planTier || "").trim().toLowerCase();
  const orderId = String(body?.orderId || "").trim();
  const itemName = String(body?.itemName || body?.plan || "KakaoPay Plan").trim() || "KakaoPay Plan";
  const amount = normalizeNonNegativeInteger(body?.amount);
  const quantity = normalizePositiveInteger(body?.quantity, 1) || 1;
  const vatAmount = normalizePositiveInteger(body?.vatAmount, Math.floor(amount / 11));
  const taxFreeAmount = normalizePositiveInteger(body?.taxFreeAmount, 0);
  const registerSubscription =
    body?.registerSubscription === true || String(body?.paymentMode || "").trim().toLowerCase() === "subscription";
  const isProTrialRegistration =
    registerSubscription &&
    body?.proTrial === true &&
    requestedTier === PRO_TRIAL_TIER;
  const approvalUrl = String(body?.approvalUrl || `${clientOrigin}/?kakaoPay=approve`).trim();
  const cancelUrl = String(body?.cancelUrl || `${clientOrigin}/?kakaoPay=cancel`).trim();
  const failUrl = String(body?.failUrl || `${clientOrigin}/?kakaoPay=fail`).trim();

  if ((!orderId || (!isProTrialRegistration && amount <= 0) || (isProTrialRegistration && amount < 0))) {
    sendJson(res, 400, { message: "amount and orderId are required." }, allowOrigin);
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
    sendJson(res, 400, { message: readyUrlError }, allowOrigin);
    return;
  }

  if (registerSubscription) {
    const subscriptionConfigError = validateKakaoSubscriptionConfig({
      secretKey,
      subscriptionCid,
      apiBase,
    });
    if (subscriptionConfigError) {
      sendJson(res, 500, { message: subscriptionConfigError }, allowOrigin);
      return;
    }
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }
  const authenticatedUserId = authResult.userId;

  if (isProTrialRegistration) {
    try {
      const trialStatus = await getProTrialStatus({ authResult });
      if (!trialStatus.eligible) {
        const message = trialStatus.claimedAt
          ? "Pro 무료 1개월 체험은 이미 사용했습니다."
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Pro trial status lookup failed." }, allowOrigin);
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
      const rawDetail = String(data?.raw || "").trim();
      const detail =
        data?.msg || data?.message || data?.error || data?.code || (rawDetail ? rawDetail.slice(0, 300) : "");
      const message = detail ? `KakaoPay ready failed: ${detail}` : "KakaoPay ready failed.";
      sendJson(res, response.status, { ...data, message }, allowOrigin);
      return;
    }

    sendJson(
      res,
      200,
      {
        ...data,
        paymentMode: registerSubscription ? "subscription" : "one-time",
        cid: requestPayload.cid,
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `KakaoPay ready failed: ${error.message}` }, allowOrigin);
  }
}
