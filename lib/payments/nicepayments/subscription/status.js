import { buildCorsHeaders, getRuntimeConfig, sendJson } from "../../nicepayments.js";
import { authenticateSupabaseUserFromRequest } from "../../../billing/tier-sync.js";
import {
  buildPublicNiceSubscription,
  fetchNiceSubscriptionByUserId,
} from "../../../billing/nice-subscription-store.js";

export default async function handler(req, res) {
  const { allowOrigin } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
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
    const publicSubscription = buildPublicNiceSubscription(subscription);
    sendJson(
      res,
      200,
      {
        ok: true,
        subscription: publicSubscription,
        hasActiveSubscription: publicSubscription?.status === "active",
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `Subscription status fetch failed: ${error.message}` }, allowOrigin);
  }
}
