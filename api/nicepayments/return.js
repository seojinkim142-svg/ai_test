import {
  buildCorsHeaders,
  buildNiceSignature,
  createPaymentToken,
  getRuntimeConfig,
  makeNiceApiUrl,
  parseRequestBody,
  redirectToClient,
  safeEqual,
  sendJson,
} from "./_shared.js";

const failAndRedirect = (res, clientOrigin, message) => {
  redirectToClient(res, clientOrigin, {
    state: "fail",
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

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  if (!clientId || !secretKey) {
    failAndRedirect(res, clientOrigin, "NICEPAYMENTS credentials are not set.");
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    failAndRedirect(res, clientOrigin, "Invalid return payload.");
    return;
  }

  const authResultCode = String(body.authResultCode || body.resultCode || "").trim();
  const authResultMsg = String(body.authResultMsg || body.resultMsg || "").trim();
  if (authResultCode !== "0000") {
    failAndRedirect(res, clientOrigin, authResultMsg || "Payment authorization failed.");
    return;
  }

  const tid = String(body.tid || "").trim();
  const orderId = String(body.orderId || "").trim();
  const amount = String(body.amount || "").trim();
  const authToken = String(body.authToken || "").trim();
  const signature = String(body.signature || "").trim();
  const responseClientId = String(body.clientId || clientId).trim();

  if (!tid || !orderId || !amount || !authToken || !signature) {
    failAndRedirect(res, clientOrigin, "Required payment fields are missing.");
    return;
  }

  if (responseClientId !== clientId) {
    failAndRedirect(res, clientOrigin, "Client ID does not match.");
    return;
  }

  const expectedSignature = buildNiceSignature({
    authToken,
    clientId,
    amount,
    secretKey,
  });

  if (!safeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) {
    failAndRedirect(res, clientOrigin, "Signature verification failed.");
    return;
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    failAndRedirect(res, clientOrigin, "Invalid payment amount.");
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

    const text = await confirmResponse.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!confirmResponse.ok) {
      const message = String(data?.resultMsg || data?.message || data?.msg || "Payment confirmation failed.");
      failAndRedirect(res, clientOrigin, message);
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

    redirectToClient(res, clientOrigin, {
      state: "success",
      token,
      orderId: confirmedOrderId,
      amount: confirmedAmount,
    });
  } catch (error) {
    failAndRedirect(res, clientOrigin, `Payment confirmation request failed: ${error.message}`);
  }
}
