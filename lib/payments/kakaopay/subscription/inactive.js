import {
  buildCorsHeaders,
  buildKakaoRequest,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  sendJson,
  validateKakaoSubscriptionConfig,
} from "../../kakaopay.js";
import { authenticateSupabaseUserFromRequest } from "../../../billing/tier-sync.js";
import {
  buildPublicSubscription,
  fetchKakaoSubscriptionByUserId,
  markKakaoSubscriptionInactive,
} from "../../../billing/subscription-store.js";

export default async function handler(req, res) {
  const {
    allowOrigin,
    apiBase,
    authScheme,
    secretKey,
    subscriptionCid,
    subscriptionInactivePath,
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

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }

  try {
    const currentSubscription = await fetchKakaoSubscriptionByUserId({
      userId: authResult.userId,
      includeInactive: true,
    });

    if (!currentSubscription || currentSubscription.status !== "active") {
      sendJson(res, 404, { message: "Active KakaoPay subscription not found." }, allowOrigin);
      return;
    }

    const requestPayload = {
      cid: String(currentSubscription.cid || subscriptionCid).trim() || subscriptionCid,
      sid: currentSubscription.sid,
    };
    const requestOptions = buildKakaoRequest({
      authScheme,
      secretKey,
      path: subscriptionInactivePath,
      payload: requestPayload,
    });

    const response = await fetch(makeKakaoApiUrl(apiBase, subscriptionInactivePath), {
      method: "POST",
      headers: requestOptions.headers,
      body: requestOptions.body,
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      const detail =
        data?.msg || data?.message || data?.error || data?.code || String(data?.raw || "").slice(0, 300);
      sendJson(
        res,
        response.status,
        {
          ...data,
          message: detail ? `KakaoPay inactive failed: ${detail}` : "KakaoPay inactive failed.",
        },
        allowOrigin
      );
      return;
    }

    const updatedSubscription = await markKakaoSubscriptionInactive({
      userId: authResult.userId,
      reason: "user_requested",
      rawInactive: data,
    });

    sendJson(
      res,
      200,
      {
        ...data,
        ok: true,
        subscription: buildPublicSubscription(updatedSubscription),
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `KakaoPay inactive failed: ${error.message}` }, allowOrigin);
  }
}
