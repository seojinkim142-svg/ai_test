import {
  buildCorsHeaders,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
  validateKakaoRuntimeConfig,
} from "./_shared.js";
import {
  authenticateSupabaseUserFromRequest,
  syncPaidTierFromAmount,
} from "../_shared/tier-sync.js";

export default async function handler(req, res) {
  const { secretKey, cid, apiBase, authScheme, approvePath, allowOrigin } = getRuntimeConfig(req);

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

  const configError = validateKakaoRuntimeConfig({ secretKey, cid, apiBase });
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

  const tid = String(body?.tid || "").trim();
  const orderId = String(body?.orderId || "").trim();
  const pgToken = String(body?.pgToken || "").trim();
  const requestedTier = String(body?.tier || body?.planTier || "").trim().toLowerCase();
  const requestedMonths = Number(body?.billingMonths ?? body?.months ?? 1);

  if (!tid || !orderId || !pgToken) {
    sendJson(res, 400, { message: "tid, orderId, and pgToken are required." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: authResult.message }, allowOrigin);
    return;
  }
  const userId = authResult.userId;

  const requestPayload = {
    cid,
    tid,
    partner_order_id: orderId,
    partner_user_id: userId,
    pg_token: pgToken,
  };
  const useJsonPayload = authScheme !== "KakaoAK" || approvePath.includes("/online/");
  const headers = {
    Authorization: `${authScheme} ${secretKey}`,
    "Content-Type": useJsonPayload
      ? "application/json;charset=utf-8"
      : "application/x-www-form-urlencoded;charset=utf-8",
  };
  const bodyData = useJsonPayload
    ? JSON.stringify(requestPayload)
    : new URLSearchParams(requestPayload).toString();

  try {
    const response = await fetch(makeKakaoApiUrl(apiBase, approvePath), {
      method: "POST",
      headers,
      body: bodyData,
    });

    const data = await parseApiResponse(response);
    if (!response.ok) {
      const rawDetail = String(data?.raw || "").trim();
      const detail =
        data?.msg || data?.message || data?.error || data?.code || (rawDetail ? rawDetail.slice(0, 300) : "");
      const message = detail ? `KakaoPay approve failed: ${detail}` : "KakaoPay approve failed.";
      sendJson(res, response.status, { ...data, message }, allowOrigin);
      return;
    }

    const approvedAmount =
      Number(data?.amount?.total ?? data?.amount?.total_amount ?? data?.total_amount ?? body?.amount);
    const tierSyncResult = await syncPaidTierFromAmount({
      req,
      amount: approvedAmount,
      requestedTier,
      requestedMonths,
    });

    if (!tierSyncResult.ok) {
      sendJson(
        res,
        tierSyncResult.status,
        {
          ...data,
          message: tierSyncResult.message,
          tierUpdated: false,
        },
        allowOrigin
      );
      return;
    }

    sendJson(
      res,
      200,
      {
        ...data,
        tierUpdated: true,
        tier: tierSyncResult.tier,
        tierMonths: tierSyncResult.months,
        tierExpiresAt: tierSyncResult.tierExpiresAt,
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: `KakaoPay approve failed: ${error.message}` }, allowOrigin);
  }
}
