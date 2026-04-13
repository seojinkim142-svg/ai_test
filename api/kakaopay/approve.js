import {
  buildCorsHeaders,
  buildKakaoRequest,
  getRuntimeConfig,
  makeKakaoApiUrl,
  parseApiResponse,
  parseRequestBody,
  sendJson,
  validateKakaoRuntimeConfig,
  validateKakaoSubscriptionConfig,
} from "../../lib/payments/kakaopay.js";
import {
  addDaysUtc,
  authenticateSupabaseUserFromRequest,
  syncPaidTierFromAmount,
} from "../../lib/billing/tier-sync.js";
import {
  getProTrialStatus,
  PRO_TRIAL_DAYS,
  grantProTrialTier,
  markProTrialClaimed,
  PRO_TRIAL_RECURRING_AMOUNT,
  PRO_TRIAL_TIER,
} from "../../lib/billing/pro-trial.js";
import {
  buildPublicSubscription,
  fetchKakaoSubscriptionByUserId,
  markKakaoSubscriptionInactive,
  upsertKakaoSubscriptionRegistration,
} from "../../lib/billing/subscription-store.js";

const requestSubscriptionInactive = async ({
  apiBase,
  authScheme,
  secretKey,
  subscriptionInactivePath,
  subscriptionCid,
  sid,
}) => {
  const requestPayload = {
    cid: subscriptionCid,
    sid,
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
  return { ok: response.ok, status: response.status, data };
};

export default async function handler(req, res) {
  const {
    secretKey,
    cid,
    subscriptionCid,
    apiBase,
    authScheme,
    approvePath,
    subscriptionInactivePath,
    allowOrigin,
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
  const itemName = String(body?.itemName || "").trim();
  const registerSubscription =
    body?.registerSubscription === true || String(body?.paymentMode || "").trim().toLowerCase() === "subscription";
  const isProTrialRegistration =
    registerSubscription &&
    body?.proTrial === true &&
    requestedTier === PRO_TRIAL_TIER;

  if (!registerSubscription) {
    sendJson(res, 400, { message: "One-time KakaoPay payments are disabled. Use subscription billing only." }, allowOrigin);
    return;
  }

  const configError = validateKakaoRuntimeConfig({
    secretKey,
    cid,
    apiBase,
    requireCid: !registerSubscription,
  });
  if (configError) {
    sendJson(res, 500, { message: configError }, allowOrigin);
    return;
  }

  if (!tid || !orderId || !pgToken) {
    sendJson(res, 400, { message: "tid, orderId, and pgToken are required." }, allowOrigin);
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
  const userId = authResult.userId;

  let trialStatus = null;
  if (isProTrialRegistration) {
    try {
      trialStatus = await getProTrialStatus({ authResult });
      if (!trialStatus.eligible) {
        const message = trialStatus.claimedAt
          ? `Pro 무료 ${PRO_TRIAL_DAYS}일 체험은 이미 사용했습니다.`
          : "현재 Free 상태에서만 Pro 무료 체험을 시작할 수 있습니다.";
        sendJson(res, 409, { message }, allowOrigin);
        return;
      }
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Pro trial status lookup failed." }, allowOrigin);
      return;
    }
  }

  const requestPayload = {
    cid: registerSubscription ? subscriptionCid : cid,
    tid,
    partner_order_id: orderId,
    partner_user_id: userId,
    pg_token: pgToken,
  };
  const requestOptions = buildKakaoRequest({
    authScheme,
    secretKey,
    path: approvePath,
    payload: requestPayload,
  });

  try {
    const response = await fetch(makeKakaoApiUrl(apiBase, approvePath), {
      method: "POST",
      headers: requestOptions.headers,
      body: requestOptions.body,
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

    let subscriptionRecord = null;
    let subscriptionSaved = false;
    let subscriptionWarning = "";
    const approvedAtIso = data?.approved_at || data?.created_at || new Date().toISOString();
    if (registerSubscription && String(data?.sid || "").trim()) {
      try {
        const currentSubscription = await fetchKakaoSubscriptionByUserId({
          userId,
          includeInactive: true,
        });

        if (
          currentSubscription?.status === "active" &&
          String(currentSubscription?.sid || "").trim() &&
          String(currentSubscription.sid).trim() !== String(data.sid).trim()
        ) {
          const inactiveResult = await requestSubscriptionInactive({
            apiBase,
            authScheme,
            secretKey,
            subscriptionInactivePath,
            subscriptionCid: String(currentSubscription.cid || subscriptionCid).trim() || subscriptionCid,
            sid: currentSubscription.sid,
          });

          if (inactiveResult.ok) {
            await markKakaoSubscriptionInactive({
              userId,
              reason: "replaced_by_new_subscription",
              rawInactive: inactiveResult.data,
            });
          } else {
            subscriptionWarning =
              inactiveResult?.data?.message ||
              inactiveResult?.data?.msg ||
              "Previous subscription could not be inactivated automatically.";
          }
        }

        subscriptionRecord = await upsertKakaoSubscriptionRegistration({
          userId,
          sid: data.sid,
          cid: requestPayload.cid,
          tier: requestedTier,
          billingMonths: requestedMonths,
          amount: isProTrialRegistration
            ? PRO_TRIAL_RECURRING_AMOUNT
            : Number(data?.amount?.total ?? data?.amount?.total_amount ?? body?.amount),
          itemName: itemName || String(data?.item_name || body?.itemName || "").trim(),
          orderId,
          tid,
          approvedAt: approvedAtIso,
          nextChargeAt: isProTrialRegistration ? addDaysUtc(approvedAtIso, PRO_TRIAL_DAYS).toISOString() : null,
          rawApprove: data,
          metadata: {
            paymentMode: "subscription",
            proTrial: isProTrialRegistration,
            trialDays: isProTrialRegistration ? PRO_TRIAL_DAYS : null,
          },
        });
        subscriptionSaved = true;
      } catch (subscriptionError) {
        subscriptionWarning = `Subscription registration save failed: ${subscriptionError.message}`;
      }
    }

    let tierSyncResult;
    if (isProTrialRegistration) {
      tierSyncResult = await grantProTrialTier({ userId });

      if (tierSyncResult.ok) {
        try {
          const claimResult = await markProTrialClaimed({
            authResult,
            user: trialStatus?.user,
          });
          trialStatus = {
            ...trialStatus,
            claimedAt: claimResult.claimedAt,
            eligible: false,
            user: claimResult.user,
          };
        } catch (claimError) {
          subscriptionWarning = subscriptionWarning
            ? `${subscriptionWarning} Pro trial claim save failed: ${claimError.message}`
            : `Pro trial claim save failed: ${claimError.message}`;
        }
      }
    } else {
      const approvedAmount =
        Number(data?.amount?.total ?? data?.amount?.total_amount ?? data?.total_amount ?? body?.amount);
      tierSyncResult = await syncPaidTierFromAmount({
        req,
        amount: approvedAmount,
        requestedTier,
        requestedMonths,
      });
    }

    if (!tierSyncResult.ok) {
      if (isProTrialRegistration && subscriptionRecord?.sid) {
        try {
          const inactiveResult = await requestSubscriptionInactive({
            apiBase,
            authScheme,
            secretKey,
            subscriptionInactivePath,
            subscriptionCid: String(subscriptionRecord.cid || requestPayload.cid).trim() || requestPayload.cid,
            sid: subscriptionRecord.sid,
          });

          if (inactiveResult.ok) {
            await markKakaoSubscriptionInactive({
              userId,
              reason: "pro_trial_grant_failed",
              rawInactive: inactiveResult.data,
            });
          }
        } catch (inactiveError) {
          subscriptionWarning = subscriptionWarning
            ? `${subscriptionWarning} Trial subscription cleanup failed: ${inactiveError.message}`
            : `Trial subscription cleanup failed: ${inactiveError.message}`;
        }
      }

      sendJson(
        res,
        tierSyncResult.status,
        {
          ...data,
          message: tierSyncResult.message,
          tierUpdated: false,
          subscriptionWarning,
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
        paymentMode: "subscription",
        proTrial: isProTrialRegistration,
        subscriptionSaved,
        subscriptionWarning,
        subscription: buildPublicSubscription(subscriptionRecord),
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
