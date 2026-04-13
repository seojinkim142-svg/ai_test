/* global process */
import { createClient } from "@supabase/supabase-js";

const PAID_TIER_BY_AMOUNT = new Map([
  [6900, "pro"],
  [18900, "premium"],
]);
const PAID_TIER_TERM_MONTHS = { pro: 1, premium: 1 };
const PAID_TIER_BASE_AMOUNT = { pro: 6900, premium: 18900 };
const MAX_BILLING_MONTHS = 24;
const MAX_BILLING_DAYS = 365;
const DEFAULT_TIER_TABLE = "user_tiers";
const TIER_EXPIRY_COLUMN = "tier_expires_at";

const text = (value) => String(value ?? "").trim();

let cachedSupabaseAdmin = null;
let cachedSupabaseKey = "";
let cachedSupabaseUrl = "";

const isTierExpiryColumnError = (error) => {
  if (!error) return false;
  const code = text(error?.code);
  if (code === "42703" || code === "PGRST204") return true;
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes(TIER_EXPIRY_COLUMN);
};

export const addMonthsUtc = (dateInput, monthsInput = 1) => {
  const baseDate = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(baseDate.getTime())) return new Date();
  const parsedMonths = Number(monthsInput);
  const safeMonths = Number.isFinite(parsedMonths) && parsedMonths > 0 ? Math.floor(parsedMonths) : 1;
  const next = new Date(baseDate);
  next.setUTCMonth(next.getUTCMonth() + safeMonths);
  return next;
};

export const addDaysUtc = (dateInput, daysInput = 1) => {
  const baseDate = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(baseDate.getTime())) return new Date();
  const parsedDays = Number(daysInput);
  const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : 1;
  const next = new Date(baseDate);
  next.setUTCDate(next.getUTCDate() + safeDays);
  return next;
};

const parseAuthBearerToken = (req) => {
  const raw = text(req?.headers?.authorization || req?.headers?.Authorization);
  if (!raw) return "";
  const [scheme, token] = raw.split(/\s+/, 2);
  if (!/^bearer$/i.test(scheme || "")) return "";
  return text(token);
};

export const resolveSupabaseConfig = () => {
  const supabaseUrl = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const userTierTable = text(process.env.SUPABASE_USER_TIER_TABLE || process.env.VITE_SUPABASE_USER_TIER_TABLE);
  return {
    supabaseUrl,
    serviceRoleKey,
    userTierTable: userTierTable || DEFAULT_TIER_TABLE,
  };
};

export const getSupabaseAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;

  if (
    cachedSupabaseAdmin &&
    cachedSupabaseKey === serviceRoleKey &&
    cachedSupabaseUrl === supabaseUrl
  ) {
    return cachedSupabaseAdmin;
  }

  cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedSupabaseKey = serviceRoleKey;
  cachedSupabaseUrl = supabaseUrl;
  return cachedSupabaseAdmin;
};

const normalizeTier = (value) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return "";
  return Object.prototype.hasOwnProperty.call(PAID_TIER_BASE_AMOUNT, normalized) ? normalized : "";
};

const normalizeMonths = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > MAX_BILLING_MONTHS) return fallback;
  return normalized;
};

const normalizeDays = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > MAX_BILLING_DAYS) return fallback;
  return normalized;
};

const resolveTierByAmountOnly = (amountInput) => {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return PAID_TIER_BY_AMOUNT.get(amount) || "";
};

const resolveTierAndMonthsFromAmount = (amountInput) => {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) return { tier: "", months: 0 };
  for (const [tier, baseAmount] of Object.entries(PAID_TIER_BASE_AMOUNT)) {
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) continue;
    if (amount % baseAmount !== 0) continue;
    const months = amount / baseAmount;
    if (Number.isInteger(months) && months >= 1 && months <= MAX_BILLING_MONTHS) {
      return { tier, months };
    }
  }
  return { tier: "", months: 0 };
};

const resolvePaidTierSelection = ({ amount, requestedTier, requestedMonths }) => {
  const normalizedTier = normalizeTier(requestedTier);
  const normalizedMonths = normalizeMonths(requestedMonths, 1);
  if (normalizedTier) {
    const expectedAmount = Number(PAID_TIER_BASE_AMOUNT[normalizedTier]) * normalizedMonths;
    if (Number(expectedAmount) === Number(amount)) {
      return { tier: normalizedTier, months: normalizedMonths };
    }
  }

  const fromAmount = resolveTierAndMonthsFromAmount(amount);
  if (fromAmount.tier) return fromAmount;

  const fallbackTier = resolveTierByAmountOnly(amount);
  if (fallbackTier) return { tier: fallbackTier, months: PAID_TIER_TERM_MONTHS[fallbackTier] || 1 };
  return { tier: "", months: 0 };
};

const fetchTierRow = async ({ client, userTierTable, userId }) => {
  const withExpiry = await client
    .from(userTierTable)
    .select(`tier, ${TIER_EXPIRY_COLUMN}`)
    .eq("user_id", userId)
    .maybeSingle();

  if (!withExpiry.error) {
    return {
      row: withExpiry.data || null,
      hasExpiryColumn: true,
    };
  }
  if (!isTierExpiryColumnError(withExpiry.error)) {
    throw withExpiry.error;
  }

  const fallback = await client
    .from(userTierTable)
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return {
    row: fallback.data ? { ...fallback.data, [TIER_EXPIRY_COLUMN]: null } : null,
    hasExpiryColumn: false,
  };
};

const upsertTierRow = async ({
  client,
  userTierTable,
  userId,
  tier,
  tierExpiresAt,
  hasExpiryColumn,
}) => {
  const payload = { user_id: userId, tier };
  if (hasExpiryColumn) payload[TIER_EXPIRY_COLUMN] = tierExpiresAt;

  const withExpiry = await client
    .from(userTierTable)
    .upsert(payload, { onConflict: "user_id" })
    .select(hasExpiryColumn ? `tier, ${TIER_EXPIRY_COLUMN}` : "tier")
    .single();
  if (!withExpiry.error) {
    return {
      row: withExpiry.data || null,
      hasExpiryColumn,
    };
  }

  if (!(hasExpiryColumn && isTierExpiryColumnError(withExpiry.error))) {
    throw withExpiry.error;
  }

  const fallback = await client
    .from(userTierTable)
    .upsert({ user_id: userId, tier }, { onConflict: "user_id" })
    .select("tier")
    .single();
  if (fallback.error) throw fallback.error;
  return {
    row: fallback.data ? { ...fallback.data, [TIER_EXPIRY_COLUMN]: null } : null,
    hasExpiryColumn: false,
  };
};

const resolveNextExpiry = ({ tier, row, months = null, days = null }) => {
  const now = new Date();
  const currentTier = text(row?.tier).toLowerCase();
  const currentExpiry = row?.[TIER_EXPIRY_COLUMN];
  let baseDate = now;

  if (currentTier === tier && currentExpiry) {
    const parsed = new Date(currentExpiry);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      baseDate = parsed;
    }
  }

  const normalizedDays = normalizeDays(days, 0);
  if (normalizedDays > 0) {
    return addDaysUtc(baseDate, normalizedDays).toISOString();
  }

  return addMonthsUtc(baseDate, months || PAID_TIER_TERM_MONTHS[tier] || 1).toISOString();
};

const buildTierStatus = (tier, tierExpiresAtRaw) => {
  const normalizedTier = normalizeTier(tier) || "free";
  const now = Date.now();
  const expiresIso = text(tierExpiresAtRaw);

  if (!normalizedTier || normalizedTier === "free" || !expiresIso) {
    return {
      tier: normalizedTier || "free",
      tierExpiresAt: null,
      tierRemainingDays: null,
      isExpired: false,
    };
  }

  const expiresMs = Date.parse(expiresIso);
  if (!Number.isFinite(expiresMs)) {
    return {
      tier: normalizedTier,
      tierExpiresAt: null,
      tierRemainingDays: null,
      isExpired: false,
    };
  }

  const remainingMs = expiresMs - now;
  if (remainingMs <= 0) {
    return {
      tier: normalizedTier,
      tierExpiresAt: expiresIso,
      tierRemainingDays: 0,
      isExpired: true,
    };
  }

  return {
    tier: normalizedTier,
    tierExpiresAt: expiresIso,
    tierRemainingDays: Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24))),
    isExpired: false,
  };
};

async function syncPaidTierByContext({
  client,
  userTierTable,
  userId,
  amount,
  requestedTier = "",
  requestedMonths = null,
}) {
  const { tier, months } = resolvePaidTierSelection({
    amount,
    requestedTier,
    requestedMonths,
  });
  if (!tier) {
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_AMOUNT",
      message: "Unsupported payment amount for tier update.",
    };
  }

  try {
    const { row, hasExpiryColumn } = await fetchTierRow({
      client,
      userTierTable,
      userId,
    });
    const tierExpiresAt = resolveNextExpiry({ tier, row, months });
    const { row: updated } = await upsertTierRow({
      client,
      userTierTable,
      userId,
      tier,
      tierExpiresAt,
      hasExpiryColumn,
    });

    return {
      ok: true,
      status: 200,
      userId,
      tier,
      months,
      tierExpiresAt: updated?.[TIER_EXPIRY_COLUMN] || tierExpiresAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "TIER_SYNC_FAILED",
      message: `Tier sync failed: ${error?.message || error}`,
    };
  }
}

export async function syncPaidTierForUserId({
  userId,
  amount,
  requestedTier = "",
  requestedMonths = null,
}) {
  const client = getSupabaseAdminClient();
  const { userTierTable } = resolveSupabaseConfig();
  if (!client) {
    return {
      ok: false,
      status: 500,
      code: "SUPABASE_CONFIG_MISSING",
      message: "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (!text(userId)) {
    return {
      ok: false,
      status: 400,
      code: "USER_ID_REQUIRED",
      message: "User ID is required for tier sync.",
    };
  }

  return syncPaidTierByContext({
    client,
    userTierTable,
    userId: text(userId),
    amount,
    requestedTier,
    requestedMonths,
  });
}

export async function getUserTierStatusForUserId({ userId }) {
  const client = getSupabaseAdminClient();
  const { userTierTable } = resolveSupabaseConfig();
  if (!client) {
    return {
      ok: false,
      status: 500,
      code: "SUPABASE_CONFIG_MISSING",
      message: "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (!text(userId)) {
    return {
      ok: false,
      status: 400,
      code: "USER_ID_REQUIRED",
      message: "User ID is required for tier status.",
    };
  }

  try {
    const { row } = await fetchTierRow({
      client,
      userTierTable,
      userId: text(userId),
    });
    const status = buildTierStatus(row?.tier, row?.[TIER_EXPIRY_COLUMN]);
    return {
      ok: true,
      status: 200,
      userId: text(userId),
      ...status,
      effectiveTier: status.isExpired ? "free" : status.tier,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "TIER_STATUS_FAILED",
      message: `Tier status lookup failed: ${error?.message || error}`,
    };
  }
}

export async function grantPaidTierForUserId({
  userId,
  tier,
  months = null,
  days = null,
}) {
  const client = getSupabaseAdminClient();
  const { userTierTable } = resolveSupabaseConfig();
  const normalizedTier = normalizeTier(tier);
  const normalizedDays = normalizeDays(days, 0);
  const normalizedMonths =
    normalizedDays > 0 ? 0 : normalizeMonths(months, PAID_TIER_TERM_MONTHS[normalizedTier] || 1);

  if (!client) {
    return {
      ok: false,
      status: 500,
      code: "SUPABASE_CONFIG_MISSING",
      message: "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (!text(userId)) {
    return {
      ok: false,
      status: 400,
      code: "USER_ID_REQUIRED",
      message: "User ID is required for tier grant.",
    };
  }

  if (!normalizedTier) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_TIER",
      message: "Only paid tiers can be granted.",
    };
  }

  try {
    const { row, hasExpiryColumn } = await fetchTierRow({
      client,
      userTierTable,
      userId: text(userId),
    });
    const tierExpiresAt = resolveNextExpiry({
      tier: normalizedTier,
      row,
      months: normalizedMonths,
      days: normalizedDays,
    });
    const { row: updated } = await upsertTierRow({
      client,
      userTierTable,
      userId: text(userId),
      tier: normalizedTier,
      tierExpiresAt,
      hasExpiryColumn,
    });

    return {
      ok: true,
      status: 200,
      userId: text(userId),
      tier: normalizedTier,
      months: normalizedMonths || null,
      days: normalizedDays || null,
      tierExpiresAt: updated?.[TIER_EXPIRY_COLUMN] || tierExpiresAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "TIER_GRANT_FAILED",
      message: `Tier grant failed: ${error?.message || error}`,
    };
  }
}

export async function syncPaidTierFromAmount({
  req,
  amount,
  requestedTier = "",
  requestedMonths = null,
}) {
  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) return authResult;

  return syncPaidTierByContext({
    client: authResult.client,
    userTierTable: authResult.userTierTable,
    userId: authResult.userId,
    amount,
    requestedTier,
    requestedMonths,
  });
}

export async function authenticateSupabaseUserFromRequest(req) {
  const token = parseAuthBearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Authorization bearer token is required.",
    };
  }

  const client = getSupabaseAdminClient();
  const { userTierTable } = resolveSupabaseConfig();
  if (!client) {
    return {
      ok: false,
      status: 500,
      code: "SUPABASE_CONFIG_MISSING",
      message: "Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid or expired auth session.",
    };
  }

  return {
    ok: true,
    status: 200,
    userId: authData.user.id,
    client,
    userTierTable,
  };
}
