import {
  buildCorsHeaders,
  formatNiceEdiDate,
  getRuntimeConfig,
  requestNiceBillingApi,
  sendJson,
  sha256Hex,
  validateNiceBillingConfig,
} from "../_shared.js";
import { authenticateSupabaseUserFromRequest } from "../../_shared/tier-sync.js";
import {
  buildPublicNiceSubscription,
  fetchNiceSubscriptionByUserId,
  markNiceSubscriptionInactive,
} from "../../_shared/nice-subscription-store.js";

const REMOVE_PATH = "/webapi/billing/billkey_remove.jsp";
const text = (value) => String(value ?? "").trim();
const createBillingOrderId = () => `nice_sub_inactive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default async function handler(req, res) {
  const {
    allowOrigin,
    billingMid,
    billingMerchantKey,
    billingApiBase,
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

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  try {
    const currentSubscription = await fetchNiceSubscriptionByUserId({
      userId: authResult.userId,
      includeInactive: true,
    });

    if (!currentSubscription || currentSubscription.status !== "active") {
      sendJson(res, 404, { message: "Active NICEPAYMENTS subscription not found." }, allowOrigin);
      return;
    }

    const mid = text(currentSubscription.cid || billingMid);
    const bid = text(currentSubscription.sid);
    const amount = Number(currentSubscription.amount || 0);
    const moid = createBillingOrderId();
    const ediDate = formatNiceEdiDate();
    const result = await requestNiceBillingApi({
      apiBase: billingApiBase,
      path: REMOVE_PATH,
      payload: {
        BID: bid,
        MID: mid,
        EdiDate: ediDate,
        Moid: moid,
        Amt: String(Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0),
        SignData: sha256Hex(mid, ediDate, moid, bid, billingMerchantKey),
        CharSet: "utf-8",
        EdiType: "JSON",
      },
    });

    if (!result.ok || text(result?.data?.ResultCode) !== "F101") {
      const detail = text(result?.data?.ResultMsg || result?.data?.message || result?.data?.msg);
      sendJson(
        res,
        result.status || 500,
        {
          ...result.data,
          message: detail ? `NICEPAYMENTS inactive failed: ${detail}` : "NICEPAYMENTS inactive failed.",
        },
        allowOrigin
      );
      return;
    }

    const updatedSubscription = await markNiceSubscriptionInactive({
      userId: authResult.userId,
      reason: "user_requested",
      rawInactive: result.data,
    });

    sendJson(
      res,
      200,
      {
        ...result.data,
        ok: true,
        subscription: buildPublicNiceSubscription(updatedSubscription),
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `NICEPAYMENTS inactive failed: ${error.message}` }, allowOrigin);
  }
}
