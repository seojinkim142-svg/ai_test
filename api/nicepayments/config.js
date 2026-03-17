import { buildCorsHeaders, getRuntimeConfig, sendJson } from "../../lib/payments/nicepayments.js";

const DEFAULT_JS_URL = "https://pay.nicepay.co.kr/v1/js/";

export default async function handler(req, res) {
  const { allowOrigin, clientId, clientOrigin } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const returnUrl = `${String(clientOrigin || "").replace(/\/$/, "")}/api/nicepayments/return`;
  sendJson(
    res,
    200,
    {
      ok: true,
      clientId,
      returnUrl,
      jsUrl: String(process.env.NICEPAYMENTS_JS_URL || DEFAULT_JS_URL).trim() || DEFAULT_JS_URL,
    },
    allowOrigin
  );
}
