import {
  buildCorsHeaders,
  createPaymentToken,
  formatNiceEdiDate,
  getRuntimeConfig,
  parseRequestBody,
  sendJson,
  sha256Hex,
  validateNiceBillingConfig,
} from "../../nicepayments.js";
import { authenticateSupabaseUserFromRequest } from "../../../billing/tier-sync.js";
import {
  getProTrialStatus,
  PRO_TRIAL_RECURRING_AMOUNT,
  PRO_TRIAL_TIER,
} from "../../../billing/pro-trial.js";

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

  const requestedTier = text(body?.tier || body?.planTier).toLowerCase();
  const isProTrial = body?.proTrial === true && requestedTier === PRO_TRIAL_TIER;
  const requestedAmount = normalizePositiveInteger(body?.amount, 0);
  const amount = isProTrial
    ? normalizePositiveInteger(body?.amount, PRO_TRIAL_RECURRING_AMOUNT) || PRO_TRIAL_RECURRING_AMOUNT
    : requestedAmount;
  const billingMonths = normalizePositiveInteger(body?.billingMonths ?? body?.months, 1) || 1;
  const nativeReturn = body?.nativeReturn === true;
  const itemName = text(body?.itemName || body?.orderName || body?.goodsName || "NicePayments Subscription");
  const orderId = text(body?.orderId) || createOrderId();
  const buyerName = text(body?.buyerName || body?.name || authResult.userId.slice(0, 8));
  const buyerEmail = text(body?.buyerEmail || body?.email || "");

  if (!amount || !requestedTier) {
    sendJson(res, 400, { message: "amount and tier are required." }, allowOrigin);
    return;
  }

  if (isProTrial) {
    try {
      const trialStatus = await getProTrialStatus({ authResult });
      if (!trialStatus.eligible) {
        const message = trialStatus.claimedAt
          ? "Pro 무료 1개월 체험은 이미 사용했습니다."
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Pro trial status lookup failed." }, allowOrigin);
      return;
    }
  }

  const ediDate = formatNiceEdiDate();
  const signData = sha256Hex(ediDate, billingMid, amount, billingMerchantKey);
  const returnUrl = new URL(
    `${String(clientOrigin || "").replace(/\/$/, "")}/api/nicepayments/subscription/return`
  );
  if (nativeReturn) {
    returnUrl.searchParams.set("mode", "native");
  }
  const reservedToken = createPaymentToken(
    {
      flow: "nice_subscription",
      proTrial: isProTrial,
      userId: authResult.userId,
      orderId,
      amount,
      chargeAmount: isProTrial ? PRO_TRIAL_RECURRING_AMOUNT : amount,
      tier: requestedTier,
      billingMonths: isProTrial ? 1 : billingMonths,
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
      action: returnUrl.toString(),
      fields: {
        PayMethod: "CARD",
        BillAuthYN: "Y",
        MID: billingMid,
        Moid: orderId,
        Amt: String(amount),
        GoodsName: itemName,
        BuyerName: buyerName,
        BuyerEmail: buyerEmail,
        ReturnURL: returnUrl.toString(),
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
