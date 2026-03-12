/* global process */
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.KAKAOPAY_PORT || 8787);
const SECRET_KEY = process.env.KAKAOPAY_SECRET_KEY;
const CID = process.env.KAKAOPAY_CID || "TC0ONETIME";
const API_BASE = process.env.KAKAOPAY_API_BASE || "https://open-api.kakaopay.com";
const explicitAuthScheme = String(process.env.KAKAOPAY_AUTH_SCHEME || "").trim();
const AUTH_SCHEME = explicitAuthScheme
  ? explicitAuthScheme
  : API_BASE.includes("open-api.kakaopay.com")
    ? String(SECRET_KEY || "").startsWith("DEV")
      ? "DEV_SECRET_KEY"
      : "SECRET_KEY"
    : "KakaoAK";
const READY_PATH =
  process.env.KAKAOPAY_READY_PATH || (AUTH_SCHEME === "KakaoAK" ? "/v1/payment/ready" : "/online/v1/payment/ready");
const APPROVE_PATH =
  process.env.KAKAOPAY_APPROVE_PATH ||
  (AUTH_SCHEME === "KakaoAK" ? "/v1/payment/approve" : "/online/v1/payment/approve");
const CLIENT_ORIGIN = process.env.KAKAOPAY_CLIENT_ORIGIN || "http://localhost:5173";
const ALLOW_ORIGIN = process.env.KAKAOPAY_ALLOW_ORIGIN || CLIENT_ORIGIN;

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });

const makeUrl = (path) => `${API_BASE.replace(/\/$/, "")}${path}`;
const buildRequestOptions = (path, payload) => {
  const useJsonPayload = AUTH_SCHEME !== "KakaoAK" || String(path || "").includes("/online/");
  const headers = {
    Authorization: `${AUTH_SCHEME} ${SECRET_KEY}`,
    "Content-Type": useJsonPayload
      ? "application/json;charset=utf-8"
      : "application/x-www-form-urlencoded;charset=utf-8",
  };
  const body = useJsonPayload
    ? JSON.stringify(payload)
    : new URLSearchParams(payload).toString();
  return { headers, body };
};

const handler = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/kakaopay/ready") {
    if (!SECRET_KEY) {
      sendJson(res, 500, { message: "KAKAOPAY_SECRET_KEY is not set." });
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." });
      return;
    }

    const amount = Number(body.amount);
    const orderId = String(body.orderId || "");
    const userId = String(body.userId || "");

    if (!Number.isFinite(amount) || amount <= 0 || !orderId || !userId) {
      sendJson(res, 400, { message: "amount, orderId, and userId are required." });
      return;
    }

    const payload = {
      cid: CID,
      partner_order_id: orderId,
      partner_user_id: userId,
      item_name: body.itemName || body.plan || "KakaoPay Plan",
      quantity: "1",
      total_amount: String(amount),
      vat_amount: String(Math.floor(amount / 11)),
      tax_free_amount: "0",
      approval_url: body.approvalUrl || `${CLIENT_ORIGIN}/?kakaoPay=approve`,
      cancel_url: body.cancelUrl || `${CLIENT_ORIGIN}/?kakaoPay=cancel`,
      fail_url: body.failUrl || `${CLIENT_ORIGIN}/?kakaoPay=fail`,
    };
    const requestOptions = buildRequestOptions(READY_PATH, payload);

    try {
      const response = await fetch(makeUrl(READY_PATH), {
        method: "POST",
        headers: requestOptions.headers,
        body: requestOptions.body,
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        sendJson(res, response.status, data);
        return;
      }

      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { message: `KakaoPay ready failed: ${err.message}` });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kakaopay/approve") {
    if (!SECRET_KEY) {
      sendJson(res, 500, { message: "KAKAOPAY_SECRET_KEY is not set." });
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." });
      return;
    }

    const tid = String(body.tid || "");
    const orderId = String(body.orderId || "");
    const userId = String(body.userId || "");
    const pgToken = String(body.pgToken || "");

    if (!tid || !orderId || !userId || !pgToken) {
      sendJson(res, 400, { message: "tid, orderId, userId, and pgToken are required." });
      return;
    }

    const payload = {
      cid: CID,
      tid,
      partner_order_id: orderId,
      partner_user_id: userId,
      pg_token: pgToken,
    };
    const requestOptions = buildRequestOptions(APPROVE_PATH, payload);

    try {
      const response = await fetch(makeUrl(APPROVE_PATH), {
        method: "POST",
        headers: requestOptions.headers,
        body: requestOptions.body,
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        sendJson(res, response.status, data);
        return;
      }

      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { message: `KakaoPay approve failed: ${err.message}` });
    }
    return;
  }

  sendJson(res, 404, { message: "Not found" });
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[kakaopay] server listening on http://localhost:${PORT}`);
});
