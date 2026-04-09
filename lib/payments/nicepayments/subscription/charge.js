import {
  buildCorsHeaders,
  formatNiceIsoDate,
  getRuntimeConfig,
  parseRequestBody,
  requestNiceSubscribeApi,
  sendJson,
  sha256Hex,
  validateNiceSubscribeConfig,
} from "../../nicepayments.js";
import { authenticateSupabaseUserFromRequest, syncPaidTierForUserId } from "../../../billing/tier-sync.js";
import {
  buildPublicNiceSubscription,
  fetchNiceSubscriptionByUserId,
  listDueNiceSubscriptions,
  recordNiceSubscriptionChargeFailure,
  recordNiceSubscriptionChargeSuccess,
} from "../../../billing/nice-subscription-store.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const text = (value) => String(value ?? "").trim();

const getRequestUrl = (req) => {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
  } catch {
    return new URL("http://localhost/");
  }
};

const extractBearerToken = (authHeader) => {
  const raw = text(authHeader);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? text(match[1]) : "";
};

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const createOrderId = (prefix = "nice_sub_charge") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeNiceTimestamp = (value) => {
  const raw = text(value);
  if (!raw || raw === "0") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getResultCode = (data = {}) => text(data?.resultCode || data?.ResultCode);
const getResultMessage = (data = {}) => text(data?.resultMsg || data?.ResultMsg || data?.message || data?.msg || data?.error);

const verifyChargeSignature = ({ response, secretKey }) => {
  const signature = text(response?.signature);
  if (!signature) return true;

  const tid = text(response?.tid);
  const amount = normalizePositiveInteger(response?.amount, 0);
  const ediDate = text(response?.ediDate);
  if (!tid || !amount || !ediDate) return false;

  return signature.toLowerCase() === sha256Hex(tid, amount, ediDate, secretKey).toLowerCase();
};

const performSingleCharge = async ({
  subscribeApiBase,
  clientId,
  secretKey,
  subscription,
}) => {
  const billingKey = text(subscription?.sid);
  const orderId = createOrderId("nice_sub_order");
  const amount = normalizePositiveInteger(subscription?.amount, 0);

  if (!billingKey || !amount) {
    throw new Error("Subscription record is incomplete.");
  }

  const ediDate = formatNiceIsoDate();
  const result = await requestNiceSubscribeApi({
    apiBase: subscribeApiBase,
    path: `/v1/subscribe/${encodeURIComponent(billingKey)}/payments`,
    payload: {
      orderId,
      amount,
      goodsName: text(subscription?.item_name || `NicePayments ${text(subscription?.tier || "subscription")}`),
      cardQuota: 0,
      useShopInterest: false,
      ediDate,
      signData: sha256Hex(orderId, billingKey, ediDate, secretKey),
      returnCharSet: "utf-8",
    },
    clientId: text(subscription?.cid || clientId),
    secretKey,
  });

  if (!result.ok || getResultCode(result?.data) !== "0000") {
    throw new Error(getResultMessage(result?.data) || "NicePayments recurring charge failed.");
  }

  if (!verifyChargeSignature({ response: result?.data, secretKey })) {
    throw new Error("NicePayments recurring charge signature verification failed.");
  }

  const chargedSubscription = await recordNiceSubscriptionChargeSuccess({
    userId: subscription.user_id,
    orderId,
    tid: text(result?.data?.tid),
    rawCharge: result.data,
    chargedAt: normalizeNiceTimestamp(result?.data?.paidAt) || new Date().toISOString(),
  });

  const tierSync = await syncPaidTierForUserId({
    userId: subscription.user_id,
    amount,
    requestedTier: text(subscription?.tier || ""),
    requestedMonths: normalizePositiveInteger(subscription?.billing_months, 1),
  });

  return {
    ok: true,
    charged: true,
    orderId,
    data: result.data,
    subscription: chargedSubscription,
    tierSync,
  };
};

const recordChargeFailureSafe = async (subscription, message) => {
  try {
    await recordNiceSubscriptionChargeFailure({
      userId: subscription?.user_id,
      errorMessage: message,
      retryAfter: new Date(Date.now() + ONE_DAY_MS),
    });
  } catch {
    // Ignore persistence failure after charge failure.
  }
};

export default async function handler(req, res) {
  const { allowOrigin, clientId, secretKey, subscribeApiBase } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const configError = validateNiceSubscribeConfig({
    clientId,
    secretKey,
    apiBase: subscribeApiBase,
  });
  if (configError) {
    sendJson(res, 500, { message: configError }, allowOrigin);
    return;
  }

  const requestUrl = getRequestUrl(req);
  const isGetRequest = req.method === "GET";
  let body = {};
  if (!isGetRequest) {
    try {
      body = await parseRequestBody(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
      return;
    }
  }

  const cronSecret = text(process.env.NICEPAYMENTS_BILLING_CRON_SECRET);
  const vercelCronSecret = text(process.env.CRON_SECRET);
  const requestCronSecret = text(req.headers["x-billing-cron-secret"] || req.headers["X-Billing-Cron-Secret"]);
  const authorizationToken = extractBearerToken(req.headers.authorization || req.headers.Authorization);
  const acceptedSecrets = new Set([cronSecret, vercelCronSecret].filter(Boolean));
  const hasAuthorizedCronSecret =
    (requestCronSecret && acceptedSecrets.has(requestCronSecret)) ||
    (authorizationToken && acceptedSecrets.has(authorizationToken));
  const shouldChargeDue =
    isGetRequest ||
    body?.chargeDue === true ||
    String(body?.chargeDue || "").trim().toLowerCase() === "true";
  const isCronRequest = hasAuthorizedCronSecret && shouldChargeDue;

  if (isCronRequest) {
    try {
      const limitSource = isGetRequest ? requestUrl.searchParams.get("limit") : body?.limit;
      const limit = normalizePositiveInteger(limitSource, 10) || 10;
      const dueSubscriptions = await listDueNiceSubscriptions({ limit });
      const results = [];

      for (const subscription of dueSubscriptions) {
        try {
          const result = await performSingleCharge({
            subscribeApiBase,
            clientId,
            secretKey,
            subscription,
          });
          results.push({
            ok: true,
            userId: subscription.user_id,
            orderId: result.orderId,
            tierUpdated: Boolean(result.tierSync?.ok),
            tier: result.tierSync?.tier || text(subscription?.tier || ""),
            subscription: buildPublicNiceSubscription(result.subscription),
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

  if (isGetRequest) {
    sendJson(res, 401, { message: "Unauthorized cron request." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  try {
    const subscription = await fetchNiceSubscriptionByUserId({
      userId: authResult.userId,
      includeInactive: true,
    });
    if (!subscription || subscription.status !== "active") {
      sendJson(res, 404, { message: "Active NICEPAYMENTS subscription not found." }, allowOrigin);
      return;
    }

    const result = await performSingleCharge({
      subscribeApiBase,
      clientId,
      secretKey,
      subscription,
    });

    sendJson(
      res,
      200,
      {
        ok: true,
        charged: true,
        tierUpdated: Boolean(result.tierSync?.ok),
        tier: result.tierSync?.tier || text(subscription?.tier || ""),
        message: result.tierSync?.ok ? "" : result.tierSync?.message || "",
        subscription: buildPublicNiceSubscription(result.subscription),
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `NICEPAYMENTS charge failed: ${error.message}` }, allowOrigin);
  }
}
