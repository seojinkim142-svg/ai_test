import {
  buildCorsHeaders,
  getRuntimeConfig,
  parseRequestBody,
  sendJson,
  verifyPaymentToken,
} from "./_shared.js";

export default async function handler(req, res) {
  const { allowOrigin, secretKey } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const token = String(body?.token || "").trim();
  if (!token) {
    sendJson(res, 400, { message: "token is required." }, allowOrigin);
    return;
  }

  if (!secretKey) {
    sendJson(res, 500, { message: "NICEPAYMENTS_SECRET_KEY is not set." }, allowOrigin);
    return;
  }

  const payload = verifyPaymentToken(token, secretKey);
  if (!payload) {
    sendJson(res, 400, { message: "Payment token is invalid or expired." }, allowOrigin);
    return;
  }

  const orderId = String(payload.orderId || "");
  const amount = Number(payload.amount);
  const tid = String(payload.tid || "");

  if (!orderId || !Number.isFinite(amount) || amount <= 0) {
    sendJson(res, 400, { message: "Payment token payload is invalid." }, allowOrigin);
    return;
  }

  sendJson(
    res,
    200,
    {
      ok: true,
      orderId,
      amount,
      tid,
      approvedAt: payload.approvedAt || null,
    },
    allowOrigin
  );
}
