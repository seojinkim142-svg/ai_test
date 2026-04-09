import {
  buildCorsHeaders,
  formatNiceIsoDate,
  getRuntimeConfig,
  requestNiceSubscribeApi,
  sendJson,
  sha256Hex,
  validateNiceSubscribeConfig,
} from "../../nicepayments.js";
import { authenticateSupabaseUserFromRequest } from "../../../billing/tier-sync.js";
import {
  buildPublicNiceSubscription,
  fetchNiceSubscriptionByUserId,
  markNiceSubscriptionInactive,
} from "../../../billing/nice-subscription-store.js";

const text = (value) => String(value ?? "").trim();
const createOrderId = () => `nice_sub_inactive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const getResultCode = (data = {}) => text(data?.resultCode || data?.ResultCode);
const getResultMessage = (data = {}) => text(data?.resultMsg || data?.ResultMsg || data?.message || data?.msg || data?.error);

export default async function handler(req, res) {
  const { allowOrigin, clientId, secretKey, subscribeApiBase } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
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

    const billingKey = text(currentSubscription.sid);
    if (!billingKey) {
      sendJson(res, 400, { message: "Subscription BID is missing." }, allowOrigin);
      return;
    }

    const orderId = createOrderId();
    const ediDate = formatNiceIsoDate();
    const result = await requestNiceSubscribeApi({
      apiBase: subscribeApiBase,
      path: `/v1/subscribe/${encodeURIComponent(billingKey)}/expire`,
      payload: {
        orderId,
        ediDate,
        signData: sha256Hex(orderId, billingKey, ediDate, secretKey),
        returnCharSet: "utf-8",
      },
      clientId: text(currentSubscription.cid || clientId),
      secretKey,
    });

    if (!result.ok || getResultCode(result?.data) !== "0000") {
      const detail = getResultMessage(result?.data);
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
