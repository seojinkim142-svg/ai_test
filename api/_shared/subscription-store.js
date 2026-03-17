/* global process */
import { addMonthsUtc, getSupabaseAdminClient } from "./tier-sync.js";

const DEFAULT_SUBSCRIPTIONS_TABLE = "billing_subscriptions";
const DEFAULT_PROVIDER = "kakaopay";

const text = (value) => String(value ?? "").trim();

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeTimestamp = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const toPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
};

const mergeMetadata = (...values) => {
  return values.reduce((acc, value) => {
    const plain = toPlainObject(value);
    if (!plain) return acc;
    return { ...acc, ...plain };
  }, {});
};

const maskSid = (sid) => {
  const raw = text(sid);
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 2)}****${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
};

const resolveSubscriptionsTable = () =>
  text(process.env.SUPABASE_BILLING_SUBSCRIPTIONS_TABLE || process.env.VITE_SUPABASE_BILLING_SUBSCRIPTIONS_TABLE) ||
  DEFAULT_SUBSCRIPTIONS_TABLE;

export const isTestSubscriptionCid = (cid) => /^TC/i.test(text(cid));

export const getBillingAdminContext = () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    client,
    table: resolveSubscriptionsTable(),
  };
};

export const buildPublicSubscription = (row) => {
  if (!row) return null;
  return {
    id: row.id ?? null,
    provider: text(row.provider || DEFAULT_PROVIDER),
    status: text(row.status || ""),
    tier: text(row.tier || ""),
    billingMonths: normalizePositiveInteger(row.billing_months, 1) || 1,
    amount: normalizePositiveInteger(row.amount, 0),
    cid: text(row.cid || ""),
    itemName: text(row.item_name || ""),
    approvedAt: normalizeTimestamp(row.approved_at),
    lastChargeAt: normalizeTimestamp(row.last_charge_at),
    nextChargeAt: normalizeTimestamp(row.next_charge_at),
    retryAfterAt: normalizeTimestamp(row.retry_after_at),
    lastFailedAt: normalizeTimestamp(row.last_failed_at),
    lastOrderId: text(row.last_order_id || ""),
    lastTid: text(row.last_tid || ""),
    cancelledAt: normalizeTimestamp(row.cancelled_at),
    cancelReason: text(row.cancel_reason || ""),
    lastError: text(row.last_error || ""),
    sidMasked: maskSid(row.sid),
    isTestCid: isTestSubscriptionCid(row.cid),
  };
};

export async function fetchKakaoSubscriptionByUserId({ userId, includeInactive = true } = {}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const normalizedUserId = text(userId);
  if (!normalizedUserId) return null;

  let query = context.client
    .from(context.table)
    .select("*")
    .eq("provider", DEFAULT_PROVIDER)
    .eq("user_id", normalizedUserId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!includeInactive) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listDueKakaoSubscriptions({ now = new Date(), limit = 20 } = {}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const nowIso = normalizeTimestamp(now) || new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(100, normalizePositiveInteger(limit, 20) || 20));
  const { data, error } = await context.client
    .from(context.table)
    .select("*")
    .eq("provider", DEFAULT_PROVIDER)
    .eq("status", "active")
    .lte("next_charge_at", nowIso)
    .order("next_charge_at", { ascending: true })
    .limit(safeLimit * 3);

  if (error) throw error;

  return (data || [])
    .filter((row) => {
      const retryAfter = normalizeTimestamp(row?.retry_after_at);
      return !retryAfter || new Date(retryAfter).getTime() <= new Date(nowIso).getTime();
    })
    .slice(0, safeLimit);
}

const computeNextChargeAt = ({ baseDate, billingMonths }) => {
  const normalizedBase = normalizeTimestamp(baseDate) || new Date().toISOString();
  const normalizedMonths = normalizePositiveInteger(billingMonths, 1) || 1;
  return addMonthsUtc(normalizedBase, normalizedMonths).toISOString();
};

export async function upsertKakaoSubscriptionRegistration({
  userId,
  sid,
  cid,
  tier,
  billingMonths = 1,
  amount,
  itemName = "",
  orderId = "",
  tid = "",
  approvedAt = null,
  rawApprove = null,
  metadata = null,
}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const normalizedUserId = text(userId);
  const normalizedSid = text(sid);
  const normalizedCid = text(cid);
  if (!normalizedUserId || !normalizedSid || !normalizedCid) {
    throw new Error("userId, sid, and cid are required.");
  }

  const existing = await fetchKakaoSubscriptionByUserId({ userId: normalizedUserId, includeInactive: true });
  const approvedAtIso = normalizeTimestamp(approvedAt) || new Date().toISOString();
  const normalizedMonths = normalizePositiveInteger(billingMonths, 1) || 1;
  const normalizedAmount = normalizePositiveInteger(amount, 0);
  const payload = {
    user_id: normalizedUserId,
    provider: DEFAULT_PROVIDER,
    status: "active",
    tier: text(tier).toLowerCase(),
    billing_months: normalizedMonths,
    amount: normalizedAmount,
    cid: normalizedCid,
    sid: normalizedSid,
    item_name: text(itemName || existing?.item_name || ""),
    approved_at: approvedAtIso,
    last_charge_at: approvedAtIso,
    next_charge_at: computeNextChargeAt({
      baseDate: approvedAtIso,
      billingMonths: normalizedMonths,
    }),
    retry_after_at: null,
    last_order_id: text(orderId),
    last_tid: text(tid),
    cancelled_at: null,
    cancel_reason: "",
    last_error: "",
    last_failed_at: null,
    metadata: mergeMetadata(existing?.metadata, metadata, {
      registeredAt: approvedAtIso,
    }),
    raw_approve: toPlainObject(rawApprove),
    raw_inactive: null,
    raw_charge: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await context.client
    .from(context.table)
    .upsert(payload, { onConflict: "provider,user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function markKakaoSubscriptionInactive({
  userId,
  reason = "",
  rawInactive = null,
}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const normalizedUserId = text(userId);
  if (!normalizedUserId) throw new Error("userId is required.");

  const nowIso = new Date().toISOString();
  const payload = {
    status: "inactive",
    cancel_reason: text(reason),
    cancelled_at: nowIso,
    retry_after_at: null,
    updated_at: nowIso,
    raw_inactive: toPlainObject(rawInactive),
  };

  const { data, error } = await context.client
    .from(context.table)
    .update(payload)
    .eq("provider", DEFAULT_PROVIDER)
    .eq("user_id", normalizedUserId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function recordKakaoSubscriptionChargeSuccess({
  userId,
  orderId = "",
  tid = "",
  rawCharge = null,
  chargedAt = null,
}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const existing = await fetchKakaoSubscriptionByUserId({ userId, includeInactive: true });
  if (!existing) throw new Error("Subscription not found.");

  const chargedAtIso = normalizeTimestamp(chargedAt) || new Date().toISOString();
  const nextChargeBase = normalizeTimestamp(existing.next_charge_at) || chargedAtIso;
  const payload = {
    status: "active",
    last_charge_at: chargedAtIso,
    next_charge_at: computeNextChargeAt({
      baseDate: nextChargeBase,
      billingMonths: existing.billing_months,
    }),
    retry_after_at: null,
    last_order_id: text(orderId) || text(existing.last_order_id),
    last_tid: text(tid) || text(existing.last_tid),
    last_error: "",
    last_failed_at: null,
    raw_charge: toPlainObject(rawCharge),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await context.client
    .from(context.table)
    .update(payload)
    .eq("provider", DEFAULT_PROVIDER)
    .eq("user_id", text(userId))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function recordKakaoSubscriptionChargeFailure({
  userId,
  errorMessage = "",
  retryAfter = null,
  rawCharge = null,
}) {
  const context = getBillingAdminContext();
  if (!context) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const payload = {
    last_error: text(errorMessage).slice(0, 1000),
    last_failed_at: new Date().toISOString(),
    retry_after_at:
      normalizeTimestamp(retryAfter) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    raw_charge: toPlainObject(rawCharge),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await context.client
    .from(context.table)
    .update(payload)
    .eq("provider", DEFAULT_PROVIDER)
    .eq("user_id", text(userId))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
