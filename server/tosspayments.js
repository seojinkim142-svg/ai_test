/* global process */
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.TOSS_PAYMENTS_PORT || 8790);
const SECRET_KEY = process.env.TOSS_PAYMENTS_SECRET_KEY;
const API_BASE = process.env.TOSS_PAYMENTS_API_BASE || "https://api.tosspayments.com";
const CLIENT_ORIGIN = process.env.TOSS_PAYMENTS_CLIENT_ORIGIN || "http://localhost:5173";
const ALLOW_ORIGIN = process.env.TOSS_PAYMENTS_ALLOW_ORIGIN || CLIENT_ORIGIN;

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

  if (req.method === "POST" && url.pathname === "/api/tosspayments/confirm") {
    if (!SECRET_KEY) {
      sendJson(res, 500, { message: "TOSS_PAYMENTS_SECRET_KEY is not set." });
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." });
      return;
    }

    const paymentKey = String(body.paymentKey || "");
    const orderId = String(body.orderId || "");
    const amount = Number(body.amount);

    if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 400, { message: "paymentKey, orderId, and amount are required." });
      return;
    }

    const auth = Buffer.from(`${SECRET_KEY}:`).toString("base64");

    try {
      const response = await fetch(makeUrl("/v1/payments/confirm"), {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
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
      sendJson(res, 500, { message: `Toss Payments confirm failed: ${err.message}` });
    }
    return;
  }

  sendJson(res, 404, { message: "Not found" });
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[tosspayments] server listening on http://localhost:${PORT}`);
});
