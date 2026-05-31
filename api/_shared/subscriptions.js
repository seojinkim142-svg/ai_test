const DEFAULT_SUBSCRIPTION_TABLE = "billing_subscriptions";
const KAKAOPAY_PROVIDER = "kakaopay";

const text = (value) => String(value ?? "").trim();

const toIsoStringOrNull = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const addMonthsUtc = (dateInput, monthsInput = 1) => {
  const baseDate = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(baseDate.getTime())) return new Date();
  const parsedMonths = Number(monthsInput);
  const safeMonths = Number.isFinite(parsedMonths) && parsedMonths > 0 ? Math.floor(parsedMonths) : 1;
  const next = new Date(baseDate);
  next.setUTCMonth(next.getUTCMonth() + safeMonths);
  return next;
};

const normalizeSubscriptionStatus = (value, fallback = "pending") => {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return fallback;
  if (["active", "approved", "activated"].includes(normalized)) return "active";
  if (["inactive", "inactivated", "cancelled", "canceled", "disabled", "terminated"].includes(normalized)) {
    return "cancelled";
  }
  if (["ready", "pending"].includes(normalized)) return "pending";
  if (["failed", "past_due", "overdue", "error"].includes(normalized)) return "past_due";
  return normalized;
};

const maskIdentifier = (value) => {
  const raw = text(value);
  if (!raw) return "";
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

const getSubscriptionTable = () =>
  text(process.env.SUPABASE_SUBSCRIPTION_TABLE) || DEFAULT_SUBSCRIPTION_TABLE;

const getPayloadStatus = (payload) =>
  normalizeSubscriptionStatus(
    payload?.status || payload?.subscription_status || payload?.sid_status || payload?.state || payload?.subscriptionState,
    ""
  );

const mergeObjects = (...values) =>
  values.reduce((acc, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(acc, value);
    }
    return acc;
  }, {});

export const normalizeSubscriptionBillingMonths = (value, fallback = 1) =>
  normalizePositiveInteger(value, fallback) || fallback;

export const getNextSubscriptionChargeAt = ({ approvedAt = null, billingMonths = 1 }) => {
  const approvedAtIso = toIsoStringOrNull(approvedAt) || new Date().toISOString();
  return addMonthsUtc(approvedAtIso, normalizeSubscriptionBillingMonths(billingMonths, 1)).toISOString();
};

export const fetchKakaoSubscriptionRow = async ({ client, userId }) => {
  const table = getSubscriptionTable();
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("provider", KAKAOPAY_PROVIDER)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const toPublicKakaoSubscription = (row) => {
  if (!row) return null;
  return {
    provider: KAKAOPAY_PROVIDER,
    status: normalizeSubscriptionStatus(row.status, "pending"),
    planTier: text(row.plan_tier).toLowerCase() || null,
    billingMonths: normalizeSubscriptionBillingMonths(row.billing_months, 1),
    amount: normalizePositiveInteger(row.amount, 0),
    cid: text(row.cid) || null,
    sidMasked: maskIdentifier(row.sid),
    approvedAt: toIsoStringOrNull(row.approved_at),
    nextChargeAt: toIsoStringOrNull(row.next_charge_at),
    lastChargedAt: toIsoStringOrNull(row.last_charged_at),
    lastOrderId: text(row.last_order_id) || null,
    cancelledAt: toIsoStringOrNull(row.cancelled_at),
    statusCheckedAt: toIsoStringOrNull(row.status_checked_at),
    hasSid: Boolean(text(row.sid)),
  };
};

export const upsertKakaoSubscriptionRow = async ({
  client,
  userId,
  existingRow = null,
  values = {},
}) => {
  const nowIso = new Date().toISOString();
  const table = getSubscriptionTable();
  const payload = {
    user_id: userId,
    provider: KAKAOPAY_PROVIDER,
    updated_at: nowIso,
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      payload[key] = value;
    }
  });

  if (values.metadata !== undefined) {
    payload.metadata = mergeObjects(existingRow?.metadata, values.metadata);
  }

  const { data, error } = await client
    .from(table)
    .upsert(payload, { onConflict: "user_id,provider" })
    .select("*")
    .single();

  if (error) throw error;
  return data || null;
};

export const saveKakaoSubscriptionApproval = async ({
  client,
  userId,
  existingRow = null,
  cid,
  sid,
  tid,
  partnerOrderId,
  planTier,
  billingMonths = 1,
  amount = 0,
  approvedAt = null,
  approvalPayload = {},
}) => {
  const months = normalizeSubscriptionBillingMonths(billingMonths, 1);
  const approvedAtIso = toIsoStringOrNull(approvedAt) || new Date().toISOString();

  return upsertKakaoSubscriptionRow({
    client,
    userId,
    existingRow,
    values: {
      cid: text(cid) || null,
      sid: text(sid) || null,
      tid: text(tid) || null,
      status: "active",
      plan_tier: text(planTier).toLowerCase() || null,
      billing_months: months,
      amount: normalizePositiveInteger(amount, 0),
      first_order_id: text(existingRow?.first_order_id) || text(partnerOrderId) || null,
      last_order_id: text(partnerOrderId) || null,
      approved_at: approvedAtIso,
      last_charged_at: approvedAtIso,
      next_charge_at: getNextSubscriptionChargeAt({ approvedAt: approvedAtIso, billingMonths: months }),
      cancelled_at: null,
      status_checked_at: approvedAtIso,
      approval_payload: approvalPayload && typeof approvalPayload === "object" ? approvalPayload : {},
      metadata: {
        lastEvent: "approved",
        sidIssuedAt: approvedAtIso,
      },
    },
  });
};

export const saveKakaoSubscriptionStatus = async ({
  client,
  userId,
  existingRow,
  statusPayload = {},
}) => {
  const checkedAtIso = new Date().toISOString();
  const payloadStatus = getPayloadStatus(statusPayload);
  const resolvedStatus = payloadStatus || normalizeSubscriptionStatus(existingRow?.status, "pending");

  return upsertKakaoSubscriptionRow({
    client,
    userId,
    existingRow,
    values: {
      status: resolvedStatus,
      status_checked_at: checkedAtIso,
      cancelled_at: resolvedStatus === "cancelled" ? checkedAtIso : existingRow?.cancelled_at ?? null,
      status_payload: statusPayload && typeof statusPayload === "object" ? statusPayload : {},
      metadata: {
        lastEvent: "status",
      },
    },
  });
};

export const saveKakaoSubscriptionInactive = async ({
  client,
  userId,
  existingRow,
  inactivePayload = {},
}) => {
  const cancelledAtIso = new Date().toISOString();

  return upsertKakaoSubscriptionRow({
    client,
    userId,
    existingRow,
    values: {
      status: "cancelled",
      cancelled_at: cancelledAtIso,
      next_charge_at: null,
      status_checked_at: cancelledAtIso,
      status_payload: inactivePayload && typeof inactivePayload === "object" ? inactivePayload : {},
      metadata: {
        lastEvent: "inactive",
      },
    },
  });
};

export const saveKakaoSubscriptionCharge = async ({
  client,
  userId,
  existingRow,
  partnerOrderId,
  amount = 0,
  approvedAt = null,
  chargePayload = {},
}) => {
  const approvedAtIso = toIsoStringOrNull(approvedAt) || new Date().toISOString();
  const months = normalizeSubscriptionBillingMonths(existingRow?.billing_months, 1);

  return upsertKakaoSubscriptionRow({
    client,
    userId,
    existingRow,
    values: {
      status: "active",
      amount: normalizePositiveInteger(amount, normalizePositiveInteger(existingRow?.amount, 0)),
      last_order_id: text(partnerOrderId) || text(existingRow?.last_order_id) || null,
      approved_at: toIsoStringOrNull(existingRow?.approved_at) || approvedAtIso,
      last_charged_at: approvedAtIso,
      next_charge_at: getNextSubscriptionChargeAt({ approvedAt: approvedAtIso, billingMonths: months }),
      cancelled_at: null,
      status_checked_at: approvedAtIso,
      charge_payload: chargePayload && typeof chargePayload === "object" ? chargePayload : {},
      metadata: {
        lastEvent: "charge",
      },
    },
  });
};
