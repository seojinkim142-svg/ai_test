import {
  buildCorsHeaders,
  createPaymentToken,
  formatNiceEdiDate,
  getRuntimeConfig,
  parseRequestBody,
  sendJson,
  sha256Hex,
  validateNiceBillingConfig,
} from "../_shared.js";
import { authenticateSupabaseUserFromRequest } from "../../_shared/tier-sync.js";

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const text = (value) => String(value ?? "").trim();

const createOrderId = () => `nice_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default async function handler(req, res) {
  const {
    allowOrigin,
    clientOrigin,
    billingMid,
    billingMerchantKey,
    billingApiBase,
    billingScriptUrl,
  } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const configError = validateNiceBillingConfig({
    billingMid,
    billingMerchantKey,
    billingApiBase,
  });
  if (configError) {
    sendJson(res, 500, { message: configError }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  const amount = normalizePositiveInteger(body?.amount, 0);
  const requestedTier = text(body?.tier || body?.planTier).toLowerCase();
  const billingMonths = normalizePositiveInteger(body?.billingMonths ?? body?.months, 1) || 1;
  const itemName = text(body?.itemName || body?.orderName || body?.goodsName || "NicePayments Subscription");
  const orderId = text(body?.orderId) || createOrderId();
  const buyerName = text(body?.buyerName || body?.name || authResult.userId.slice(0, 8));
  const buyerEmail = text(body?.buyerEmail || body?.email || "");

  if (!amount || !requestedTier) {
    sendJson(res, 400, { message: "amount and tier are required." }, allowOrigin);
    return;
  }

  const ediDate = formatNiceEdiDate();
  const signData = sha256Hex(ediDate, billingMid, amount, billingMerchantKey);
  const returnUrl = `${String(clientOrigin || "").replace(/\/$/, "")}/api/nicepayments/subscription/return`;
  const reservedToken = createPaymentToken(
    {
      flow: "nice_subscription",
      userId: authResult.userId,
      orderId,
      amount,
      tier: requestedTier,
      billingMonths,
      itemName,
    },
    billingMerchantKey
  );

  sendJson(
    res,
    200,
    {
      ok: true,
      scriptUrl: billingScriptUrl,
      action: returnUrl,
      fields: {
        PayMethod: "CARD",
        BillAuthYN: "Y",
        MID: billingMid,
        Moid: orderId,
        Amt: String(amount),
        GoodsName: itemName,
        BuyerName: buyerName,
        BuyerEmail: buyerEmail,
        ReturnURL: returnUrl,
        EdiDate: ediDate,
        SignData: signData,
        CharSet: "utf-8",
        EdiType: "JSON",
        ReqReserved: reservedToken,
      },
    },
    allowOrigin
  );
}
