import {
  buildCorsHeaders,
  buildNiceSignature,
  createPaymentToken,
  getRuntimeConfig,
  makeNiceApiUrl,
  parseRequestBody,
  safeEqual,
  sendJson,
} from "../../lib/payments/nicepayments.js";
import { redirectToPaymentClient } from "../../lib/payments/client-redirect.js";

const text = (value) => String(value ?? "").trim();

const getRequestUrl = (req) => {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
  } catch {
    return new URL("http://localhost/");
  }
};

const getFirstValue = (source, keys = []) => {
  for (const key of keys) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return "";
};

const normalizeReturnPayload = (source = {}) => ({
  authResultCode: getFirstValue(source, ["authResultCode", "AuthResultCode", "resultCode", "ResultCode"]),
  authResultMsg: getFirstValue(source, ["authResultMsg", "AuthResultMsg", "resultMsg", "ResultMsg", "message", "Message"]),
  tid: getFirstValue(source, ["tid", "TID", "txTid", "TxTid"]),
  orderId: getFirstValue(source, ["orderId", "Moid", "moid"]),
  amount: getFirstValue(source, ["amount", "Amt", "amt"]),
  authToken: getFirstValue(source, ["authToken", "AuthToken"]),
  signature: getFirstValue(source, ["signature", "Signature"]),
  clientId: getFirstValue(source, ["clientId", "ClientId", "mid", "MID"]),
});

const hasReturnPayload = (payload = {}) =>
  Boolean(
    payload.authResultCode ||
      payload.authResultMsg ||
      payload.tid ||
      payload.orderId ||
      payload.amount ||
      payload.authToken ||
      payload.signature ||
      payload.clientId
  );

const isCancelAuthResult = (value) => text(value).toUpperCase() === "I002";

const redirectWithState = (req, res, clientOrigin, params = {}) => {
  redirectToPaymentClient({
    req,
    res,
    clientOrigin,
    params,
  });
};

const failAndRedirect = (req, res, clientOrigin, message) => {
  redirectWithState(req, res, clientOrigin, {
    nicePay: "fail",
    message,
  });
};

export default async function handler(req, res) {
  const { allowOrigin, apiBase, clientId, secretKey, clientOrigin } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  if (!clientId || !secretKey) {
    failAndRedirect(req, res, clientOrigin, "NICEPAYMENTS credentials are not set.");
    return;
  }

  let payload;
  try {
    if (req.method === "GET") {
      const requestUrl = getRequestUrl(req);
      payload = normalizeReturnPayload(Object.fromEntries(requestUrl.searchParams.entries()));
      if (!hasReturnPayload(payload)) {
        redirectWithState(req, res, clientOrigin, {
          nicePay: "cancel",
          message: "결제가 취소되었습니다.",
        });
        return;
      }
    } else {
      payload = normalizeReturnPayload(await parseRequestBody(req));
    }
  } catch {
    failAndRedirect(req, res, clientOrigin, "Invalid return payload.");
    return;
  }

  const authResultCode = payload.authResultCode;
  const authResultMsg = payload.authResultMsg;
  if (authResultCode !== "0000") {
    redirectWithState(req, res, clientOrigin, {
      nicePay: isCancelAuthResult(authResultCode) ? "cancel" : "fail",
      message: authResultMsg || (isCancelAuthResult(authResultCode) ? "결제가 취소되었습니다." : "Payment authorization failed."),
    });
    return;
  }

  const tid = payload.tid;
  const orderId = payload.orderId;
  const amount = payload.amount;
  const authToken = payload.authToken;
  const signature = payload.signature;
  const responseClientId = payload.clientId || clientId;

  if (!tid || !orderId || !amount || !authToken || !signature) {
    failAndRedirect(req, res, clientOrigin, "Required payment fields are missing.");
    return;
  }

  if (responseClientId !== clientId) {
    failAndRedirect(req, res, clientOrigin, "Client ID does not match.");
    return;
  }

  const expectedSignature = buildNiceSignature({
    authToken,
    clientId,
    amount,
    secretKey,
  });

  if (!safeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) {
    failAndRedirect(req, res, clientOrigin, "Signature verification failed.");
    return;
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    failAndRedirect(req, res, clientOrigin, "Invalid payment amount.");
    return;
  }

  const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString("base64");

  try {
    const confirmResponse = await fetch(makeNiceApiUrl(apiBase, `/v1/payments/${encodeURIComponent(tid)}`), {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: amountNumber }),
    });

    const responseText = await confirmResponse.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!confirmResponse.ok) {
      const message = String(data?.resultMsg || data?.message || data?.msg || "Payment confirmation failed.");
      failAndRedirect(req, res, clientOrigin, message);
      return;
    }

    const confirmedOrderId = String(data?.orderId || orderId);
    const confirmedTid = String(data?.tid || tid);
    const confirmedAmountRaw = Number(data?.amount ?? amountNumber);
    const confirmedAmount =
      Number.isFinite(confirmedAmountRaw) && confirmedAmountRaw > 0 ? confirmedAmountRaw : amountNumber;

    const token = createPaymentToken(
      {
        orderId: confirmedOrderId,
        amount: confirmedAmount,
        tid: confirmedTid,
        approvedAt: String(data?.approvedAt || ""),
      },
      secretKey
    );

    redirectWithState(req, res, clientOrigin, {
      nicePay: "success",
      np_token: token,
      orderId: confirmedOrderId,
      amount: confirmedAmount,
    });
  } catch (error) {
    failAndRedirect(req, res, clientOrigin, `Payment confirmation request failed: ${error.message}`);
  }
}
