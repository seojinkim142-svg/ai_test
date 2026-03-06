import {
  buildCorsHeaders,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
} from "./_shared.js";

export default async function handler(req, res) {
  const { secretKey, cid, apiBase, authScheme, approvePath, allowOrigin } = getRuntimeConfig(req);

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

  const tid = String(body?.tid || "").trim();
  const orderId = String(body?.orderId || "").trim();
  const userId = String(body?.userId || "").trim();
  const pgToken = String(body?.pgToken || "").trim();

  if (!tid || !orderId || !userId || !pgToken) {
    sendJson(res, 400, { message: "tid, orderId, userId, and pgToken are required." }, allowOrigin);
    return;
  }

  const requestPayload = {
    cid,
    tid,
    partner_order_id: orderId,
    partner_user_id: userId,
    pg_token: pgToken,
  };
  const useJsonPayload = authScheme !== "KakaoAK" || approvePath.includes("/online/");
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
    const response = await fetch(makeKakaoApiUrl(apiBase, approvePath), {
      method: "POST",
      headers,
      body: bodyData,
    });

    const data = await parseApiResponse(response);
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error || "KakaoPay approve failed.";
      sendJson(res, response.status, { ...data, message }, allowOrigin);
      return;
    }

    sendJson(res, 200, data, allowOrigin);
  } catch (error) {
    sendJson(res, 500, { message: `KakaoPay approve failed: ${error.message}` }, allowOrigin);
  }
}
