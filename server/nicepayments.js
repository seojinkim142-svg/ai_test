/* global process */
import http from "http";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.NICEPAYMENTS_PORT || 8791);
const CLIENT_ID = process.env.NICEPAYMENTS_CLIENT_ID || process.env.NICEPAYMENTS_CLIENT_KEY;
const SECRET_KEY = process.env.NICEPAYMENTS_SECRET_KEY;
const API_BASE = process.env.NICEPAYMENTS_API_BASE || "https://api.nicepay.co.kr";
const CLIENT_ORIGIN = process.env.NICEPAYMENTS_CLIENT_ORIGIN || "http://localhost:5173";
const ALLOW_ORIGIN = process.env.NICEPAYMENTS_ALLOW_ORIGIN || CLIENT_ORIGIN;

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const pendingPayments = new Map();
const PENDING_TTL_MS = 15 * 60 * 1000;

const sendJson = (res, status, body) => {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const parseBody = async (req) => {
  const raw = await readBody(req);
  if (!raw) return {};
  const contentType = String(req.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    return JSON.parse(raw);
  }
  const params = new URLSearchParams(raw);
  const obj = {};
  for (const [key, value] of params.entries()) {
    obj[key] = value;
  }
  return obj;
};

const cleanupPending = () => {
  const now = Date.now();
  for (const [token, entry] of pendingPayments.entries()) {
    if (now - entry.createdAt > PENDING_TTL_MS) {
      pendingPayments.delete(token);
    }
  }
};

const buildRedirectUrl = (params) => {
  const base = new URL(CLIENT_ORIGIN);
  if (params.state) base.searchParams.set("nicePay", params.state);
  if (params.token) base.searchParams.set("np_token", params.token);
  if (params.orderId) base.searchParams.set("orderId", params.orderId);
  if (params.amount != null) base.searchParams.set("amount", String(params.amount));
  if (params.message) base.searchParams.set("message", params.message);
  return base.toString();
};

const redirect = (res, params) => {
  const location = buildRedirectUrl(params);
  res.writeHead(302, { Location: location });
  res.end();
};

const makeUrl = (path) => `${API_BASE.replace(/\/$/, "")}${path}`;

const hashSignature = ({ authToken, amount }) =>
  crypto.createHash("sha256").update(`${authToken}${CLIENT_ID}${amount}${SECRET_KEY}`).digest("hex");

const handler = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/nicepayments/confirm") {
    cleanupPending();

    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." });
      return;
    }

    const token = String(body.token || "").trim();
    if (!token) {
      sendJson(res, 400, { message: "token is required." });
      return;
    }

    const record = pendingPayments.get(token);
    if (!record) {
      sendJson(res, 404, { message: "Payment token not found or expired." });
      return;
    }

    pendingPayments.delete(token);
    sendJson(res, 200, {
      ok: true,
      orderId: record.orderId,
      amount: record.amount,
      tid: record.tid,
      result: record.result,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/nicepayments/return") {
    cleanupPending();

    if (!CLIENT_ID || !SECRET_KEY) {
      redirect(res, {
        state: "fail",
        message: "NICEPAYMENTS credentials are not set.",
      });
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch {
      redirect(res, { state: "fail", message: "Invalid return payload." });
      return;
    }

    const authResultCode = String(body.authResultCode || body.resultCode || "");
    const authResultMsg = String(body.authResultMsg || body.resultMsg || "");

    if (authResultCode !== "0000") {
      redirect(res, {
        state: "fail",
        message: authResultMsg || "결제 인증이 실패했습니다.",
      });
      return;
    }

    const tid = String(body.tid || "");
    const orderId = String(body.orderId || "");
    const amount = String(body.amount || "");
    const authToken = String(body.authToken || "");
    const signature = String(body.signature || "");
    const clientId = String(body.clientId || CLIENT_ID);

    if (!tid || !orderId || !amount || !authToken || !signature) {
      redirect(res, { state: "fail", message: "결제 승인 정보가 누락되었습니다." });
      return;
    }

    if (clientId !== CLIENT_ID) {
      redirect(res, { state: "fail", message: "Client ID가 일치하지 않습니다." });
      return;
    }

    const expected = hashSignature({ authToken, amount });
    if (signature.toLowerCase() !== expected.toLowerCase()) {
      redirect(res, { state: "fail", message: "서명 검증에 실패했습니다." });
      return;
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      redirect(res, { state: "fail", message: "결제 금액이 올바르지 않습니다." });
      return;
    }

    const auth = Buffer.from(`${CLIENT_ID}:${SECRET_KEY}`).toString("base64");

    try {
      const response = await fetch(makeUrl(`/v1/payments/${tid}`), {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: amountNumber }),
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        const message = data?.resultMsg || data?.message || data?.msg || "결제 승인 실패";
        redirect(res, { state: "fail", message });
        return;
      }

      const token = crypto.randomBytes(16).toString("hex");
      pendingPayments.set(token, {
        orderId,
        amount: amountNumber,
        tid,
        result: data,
        createdAt: Date.now(),
      });

      redirect(res, {
        state: "success",
        token,
        orderId,
        amount: amountNumber,
      });
    } catch (err) {
      redirect(res, { state: "fail", message: `결제 승인 요청 실패: ${err.message}` });
    }

    return;
  }

  sendJson(res, 404, { message: "Not found" });
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[nicepayments] server listening on http://localhost:${PORT}`);
});
