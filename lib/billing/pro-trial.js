import { getUserTierStatusForUserId, grantPaidTierForUserId } from "./tier-sync.js";

export const PRO_TRIAL_APP_METADATA_KEY = "zeusian_pro_trial_v1_claimed_at";
export const PRO_TRIAL_TIER = "pro";
export const PRO_TRIAL_MONTHS = 1;
export const PRO_TRIAL_RECURRING_AMOUNT = 4900;

const text = (value) => String(value ?? "").trim();

export async function fetchAuthenticatedBillingUser(authResult) {
  const { data, error } = await authResult.client.auth.admin.getUserById(authResult.userId);
  if (error || !data?.user) {
    throw new Error(error?.message || "Authenticated user lookup failed.");
  }
  return data.user;
}

export function resolveProTrialClaimedAt(user) {
  const appMetadata =
    user?.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return text(appMetadata?.[PRO_TRIAL_APP_METADATA_KEY]);
}

export async function getProTrialStatus({ authResult, user = null } = {}) {
  if (!authResult?.userId) {
    throw new Error("Authenticated user is required.");
  }

  const resolvedUser = user || (await fetchAuthenticatedBillingUser(authResult));
  const tierStatus = await getUserTierStatusForUserId({ userId: authResult.userId });
  if (!tierStatus.ok) {
    throw new Error(tierStatus.message || "Tier status lookup failed.");
  }

  const claimedAt = resolveProTrialClaimedAt(resolvedUser);
  const effectiveTier = text(tierStatus.effectiveTier || tierStatus.tier || "free").toLowerCase() || "free";
  const eligible = !claimedAt && effectiveTier === "free";

  return {
    user: resolvedUser,
    claimedAt: claimedAt || null,
    effectiveTier,
    eligible,
    tierStatus,
  };
}

export async function markProTrialClaimed({ authResult, user, claimedAt = new Date().toISOString() } = {}) {
  if (!authResult?.userId) {
    throw new Error("Authenticated user is required.");
  }

  const resolvedUser = user || (await fetchAuthenticatedBillingUser(authResult));
  const existingAppMetadata =
    resolvedUser?.app_metadata && typeof resolvedUser.app_metadata === "object" ? resolvedUser.app_metadata : {};

  const { data, error } = await authResult.client.auth.admin.updateUserById(authResult.userId, {
    app_metadata: {
      ...existingAppMetadata,
      [PRO_TRIAL_APP_METADATA_KEY]: claimedAt,
    },
  });
  if (error) throw error;
  return {
    claimedAt,
    user: data?.user || resolvedUser,
  };
}

export async function grantProTrialTier({ userId } = {}) {
  return grantPaidTierForUserId({
    userId,
    tier: PRO_TRIAL_TIER,
    months: PRO_TRIAL_MONTHS,
  });
}
