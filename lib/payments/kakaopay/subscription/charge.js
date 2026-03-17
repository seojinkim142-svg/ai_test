import {
  buildCorsHeaders,
  buildKakaoRequest,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
  validateKakaoSubscriptionConfig,
} from "../../kakaopay.js";
import {
  authenticateSupabaseUserFromRequest,
  syncPaidTierForUserId,
} from "../../../billing/tier-sync.js";
import {
  buildPublicSubscription,
  fetchKakaoSubscriptionByUserId,
  listDueKakaoSubscriptions,
  recordKakaoSubscriptionChargeFailure,
  recordKakaoSubscriptionChargeSuccess,
} from "../../../billing/subscription-store.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const text = (value) => String(value ?? "").trim();

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const createOrderId = (prefix = "kpay_sub") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const buildChargePayload = (subscription, orderId) => {
  const amount = normalizePositiveInteger(subscription?.amount, 0);
  return {
    cid: text(subscription?.cid || ""),
    sid: text(subscription?.sid || ""),
    partner_order_id: orderId,
    partner_user_id: text(subscription?.user_id || ""),
    item_name: text(subscription?.item_name || `KakaoPay ${text(subscription?.tier || "subscription")}`),
    quantity: "1",
    total_amount: String(amount),
    vat_amount: String(Math.floor(amount / 11)),
    tax_free_amount: "0",
  };
};

const performSingleCharge = async ({
  apiBase,
  authScheme,
  secretKey,
  subscriptionChargePath,
  subscription,
}) => {
  const orderId = createOrderId("kpay_sub");
  const requestPayload = buildChargePayload(subscription, orderId);
  if (!requestPayload.cid || !requestPayload.sid || !requestPayload.partner_user_id || !requestPayload.total_amount) {
    throw new Error("Subscription record is incomplete.");
  }

  const requestOptions = buildKakaoRequest({
    authScheme,
    secretKey,
    path: subscriptionChargePath,
    payload: requestPayload,
  });

  const response = await fetch(makeKakaoApiUrl(apiBase, subscriptionChargePath), {
    method: "POST",
    headers: requestOptions.headers,
    body: requestOptions.body,
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    const detail =
      data?.msg || data?.message || data?.error || data?.code || String(data?.raw || "").slice(0, 300);
    throw new Error(detail ? `KakaoPay subscription charge failed: ${detail}` : "KakaoPay subscription charge failed.");
  }

  const chargedSubscription = await recordKakaoSubscriptionChargeSuccess({
    userId: subscription.user_id,
    orderId,
    tid: text(data?.tid || ""),
    rawCharge: data,
    chargedAt: data?.approved_at || data?.created_at || new Date().toISOString(),
  });

  const tierSync = await syncPaidTierForUserId({
    userId: subscription.user_id,
    amount: Number(data?.amount?.total ?? data?.amount?.total_amount ?? requestPayload.total_amount),
    requestedTier: text(subscription?.tier || ""),
    requestedMonths: normalizePositiveInteger(subscription?.billing_months, 1),
  });

  return {
    ok: true,
    charged: true,
    orderId,
    data,
    subscription: chargedSubscription,
    tierSync,
  };
};

const recordChargeFailureSafe = async (subscription, message) => {
  try {
    await recordKakaoSubscriptionChargeFailure({
      userId: subscription?.user_id,
      errorMessage: message,
      retryAfter: new Date(Date.now() + ONE_DAY_MS),
    });
  } catch {
    // Ignore persistence failure after charge failure.
  }
};

export default async function handler(req, res) {
  const {
    allowOrigin,
    apiBase,
    authScheme,
    secretKey,
    subscriptionCid,
    subscriptionChargePath,
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

  if (!secretKey) {
    sendJson(res, 500, { message: "KAKAOPAY_SECRET_KEY (or KAKAOPAY_ADMIN_KEY) is not set." }, allowOrigin);
    return;
  }

  const subscriptionConfigError = validateKakaoSubscriptionConfig({
    secretKey,
    subscriptionCid,
    apiBase,
  });
  if (subscriptionConfigError) {
    sendJson(res, 500, { message: subscriptionConfigError }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const cronSecret = text(process.env.KAKAOPAY_BILLING_CRON_SECRET);
  const requestCronSecret = text(req.headers["x-billing-cron-secret"] || req.headers["X-Billing-Cron-Secret"]);
  const shouldChargeDue = body?.chargeDue === true;
  const isCronRequest = Boolean(cronSecret) && requestCronSecret === cronSecret && shouldChargeDue;

  if (isCronRequest) {
    try {
      const limit = normalizePositiveInteger(body?.limit, 10) || 10;
      const dueSubscriptions = await listDueKakaoSubscriptions({ limit });
      const results = [];

      for (const subscription of dueSubscriptions) {
        try {
          const result = await performSingleCharge({
            apiBase,
            authScheme,
            secretKey,
            subscriptionChargePath,
            subscription,
          });
          results.push({
            ok: true,
            userId: subscription.user_id,
            orderId: result.orderId,
            tierUpdated: Boolean(result.tierSync?.ok),
            tier: result.tierSync?.tier || text(subscription?.tier || ""),
            subscription: buildPublicSubscription(result.subscription),
            warning: result.tierSync?.ok ? "" : result.tierSync?.message || "",
          });
        } catch (error) {
          await recordChargeFailureSafe(subscription, error.message);
          results.push({
            ok: false,
            userId: subscription.user_id,
            message: error.message,
          });
        }
      }

      sendJson(
        res,
        200,
        {
          ok: true,
          processed: results.length,
          charged: results.filter((entry) => entry.ok).length,
          failed: results.filter((entry) => !entry.ok).length,
          results,
        },
        allowOrigin
      );
      return;
    } catch (error) {
      sendJson(res, 500, { message: `Subscription batch charge failed: ${error.message}` }, allowOrigin);
      return;
    }
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  try {
    const subscription = await fetchKakaoSubscriptionByUserId({
      userId: authResult.userId,
      includeInactive: true,
    });
    if (!subscription || subscription.status !== "active") {
      sendJson(res, 404, { message: "Active KakaoPay subscription not found." }, allowOrigin);
      return;
    }

    const result = await performSingleCharge({
      apiBase,
      authScheme,
      secretKey,
      subscriptionChargePath,
      subscription,
    });

    sendJson(
      res,
      200,
      {
        ...result.data,
        ok: true,
        charged: true,
        tierUpdated: Boolean(result.tierSync?.ok),
        tier: result.tierSync?.tier || text(subscription?.tier || ""),
        tierMonths: result.tierSync?.months || normalizePositiveInteger(subscription?.billing_months, 1),
        tierExpiresAt: result.tierSync?.tierExpiresAt || null,
        orderId: result.orderId,
        message: result.tierSync?.ok ? "" : result.tierSync?.message || "",
        subscription: buildPublicSubscription(result.subscription),
      },
      allowOrigin
    );
  } catch (error) {
    try {
      const subscription = await fetchKakaoSubscriptionByUserId({
        userId: authResult.userId,
        includeInactive: true,
      });
      if (subscription) {
        await recordChargeFailureSafe(subscription, error.message);
      }
    } catch {
      // Ignore failure-recording errors.
    }

    sendJson(res, 500, { message: error.message }, allowOrigin);
  }
}
