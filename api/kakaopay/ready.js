import {
  buildCorsHeaders,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
} from "./_shared.js";
import { authenticateSupabaseUserFromRequest } from "../_shared/tier-sync.js";

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export default async function handler(req, res) {
  const { secretKey, cid, apiBase, authScheme, readyPath, clientOrigin, allowOrigin } = getRuntimeConfig(req);

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

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const amount = normalizePositiveInteger(body?.amount);
  const orderId = String(body?.orderId || "").trim();
  const userId = String(body?.userId || "").trim();
  const itemName = String(body?.itemName || body?.plan || "KakaoPay Plan").trim() || "KakaoPay Plan";
  const quantity = normalizePositiveInteger(body?.quantity, 1) || 1;
  const vatAmount = normalizePositiveInteger(body?.vatAmount, Math.floor(amount / 11));
  const taxFreeAmount = normalizePositiveInteger(body?.taxFreeAmount, 0);
  const approvalUrl = String(body?.approvalUrl || `${clientOrigin}/?kakaoPay=approve`).trim();
  const cancelUrl = String(body?.cancelUrl || `${clientOrigin}/?kakaoPay=cancel`).trim();
  const failUrl = String(body?.failUrl || `${clientOrigin}/?kakaoPay=fail`).trim();

  if (!amount || !orderId) {
    sendJson(res, 400, { message: "amount and orderId are required." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }
  const authenticatedUserId = authResult.userId;
  if (userId && userId !== authenticatedUserId) {
    sendJson(res, 403, { message: "userId does not match authenticated user." }, allowOrigin);
    return;
  }

  const requestPayload = {
    cid,
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
  const useJsonPayload = authScheme !== "KakaoAK" || readyPath.includes("/online/");
  const headers = {
    Authorization: `${authScheme} ${secretKey}`,
    "Content-Type": useJsonPayload
      ? "application/json;charset=utf-8"
      : "application/x-www-form-urlencoded;charset=utf-8",
  };
  const bodyData = useJsonPayload
    ? JSON.stringify(requestPayload)
    : new URLSearchParams(requestPayload).toString();

  try {
    const response = await fetch(makeKakaoApiUrl(apiBase, readyPath), {
      method: "POST",
      headers,
      body: bodyData,
    });

    const data = await parseApiResponse(response);
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error || "KakaoPay ready failed.";
      sendJson(res, response.status, { ...data, message }, allowOrigin);
      return;
    }

    sendJson(res, 200, data, allowOrigin);
  } catch (error) {
    sendJson(res, 500, { message: `KakaoPay ready failed: ${error.message}` }, allowOrigin);
  }
}
