/* global process */
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.KAKAOPAY_PORT || 8787);
const ADMIN_KEY = process.env.KAKAOPAY_ADMIN_KEY;
const CID = process.env.KAKAOPAY_CID || "TC0ONETIME";
const API_BASE = process.env.KAKAOPAY_API_BASE || "https://kapi.kakao.com";
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

const handler = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/kakaopay/ready") {
    if (!ADMIN_KEY) {
      sendJson(res, 500, { message: "KAKAOPAY_ADMIN_KEY is not set." });
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

    const params = new URLSearchParams({
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
    });

    try {
      const response = await fetch(makeUrl("/v1/payment/ready"), {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${ADMIN_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: params.toString(),
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
    if (!ADMIN_KEY) {
      sendJson(res, 500, { message: "KAKAOPAY_ADMIN_KEY is not set." });
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

    const params = new URLSearchParams({
      cid: CID,
      tid,
      partner_order_id: orderId,
      partner_user_id: userId,
      pg_token: pgToken,
    });

    try {
      const response = await fetch(makeUrl("/v1/payment/approve"), {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${ADMIN_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: params.toString(),
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
