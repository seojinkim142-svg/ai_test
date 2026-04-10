import { createClient } from "@supabase/supabase-js";
import { resolveAppRedirectUrl } from "../utils/appOrigin";
import { Capacitor } from "@capacitor/core";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET || "pdf-uploads";
const MOCK_EXAMS_TABLE = "mock_exams";
const FLASHCARDS_TABLE = import.meta.env.VITE_SUPABASE_FLASHCARDS_TABLE || "flashcards";
const UPLOADS_TABLE = import.meta.env.VITE_SUPABASE_UPLOADS_TABLE || "uploads";
const ARTIFACTS_TABLE = import.meta.env.VITE_SUPABASE_ARTIFACTS_TABLE || "artifacts";
const USER_TIER_TABLE = import.meta.env.VITE_SUPABASE_USER_TIER_TABLE || "user_tiers";
const FEEDBACK_TABLE = import.meta.env.VITE_SUPABASE_FEEDBACK_TABLE || "user_feedback";
const ALLOWED_TIERS = ["free", "pro", "premium"];
export const DEFAULT_TIER = "free";
const PAID_TIERS = new Set(["pro", "premium"]);
const TIER_EXPIRY_COLUMN = "tier_expires_at";
const PAID_TIER_TERM_MONTHS = { pro: 1, premium: 1 };
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const PREMIUM_PROFILES_META_KEY = "premium_profiles_v1";
const PREMIUM_ACTIVE_PROFILE_META_KEY = "premium_active_profile_id_v1";
const PREMIUM_SPACE_MODE_META_KEY = "premium_space_mode_v1";
const normalizeAbsoluteUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
};
const trimSchemeSeparators = (value) => String(value || "").trim().replace(/:\/*$/, "");
const NATIVE_APP_SCHEME = trimSchemeSeparators(
  import.meta.env.VITE_NATIVE_APP_SCHEME || "com.tjwls.examstudyai"
);
const NATIVE_AUTH_HOST = "auth";
const NATIVE_AUTH_PATH = "/callback";
const DEFAULT_NATIVE_AUTH_REDIRECT = NATIVE_APP_SCHEME
  ? `${NATIVE_APP_SCHEME}://${NATIVE_AUTH_HOST}${NATIVE_AUTH_PATH}`
  : "";
const resolveBrowserRedirectUrl = () => {
  if (typeof window === "undefined") return "";
  try {
    return new URL("/", window.location.origin).toString();
  } catch {
    return "";
  }
};
const EXPLICIT_SUPABASE_REDIRECT = normalizeAbsoluteUrl(import.meta.env.VITE_SUPABASE_REDIRECT_URL);
const EXPLICIT_WEB_SUPABASE_REDIRECT =
  EXPLICIT_SUPABASE_REDIRECT && /^https?:/i.test(EXPLICIT_SUPABASE_REDIRECT)
    ? EXPLICIT_SUPABASE_REDIRECT
    : "";
const EXPLICIT_NATIVE_SUPABASE_REDIRECT = normalizeAbsoluteUrl(
  import.meta.env.VITE_NATIVE_AUTH_REDIRECT_URL || DEFAULT_NATIVE_AUTH_REDIRECT
);
const PREFERRED_NATIVE_SUPABASE_REDIRECT =
  EXPLICIT_NATIVE_SUPABASE_REDIRECT ||
  (EXPLICIT_SUPABASE_REDIRECT && !/^https?:/i.test(EXPLICIT_SUPABASE_REDIRECT)
    ? EXPLICIT_SUPABASE_REDIRECT
    : "") ||
  DEFAULT_NATIVE_AUTH_REDIRECT;
const PREFERRED_WEB_SUPABASE_REDIRECT =
  EXPLICIT_WEB_SUPABASE_REDIRECT ||
  (import.meta.env.DEV ? resolveBrowserRedirectUrl() : "") ||
  resolveAppRedirectUrl("/") ||
  resolveBrowserRedirectUrl();

export const SUPABASE_REDIRECT =
  (Capacitor.isNativePlatform()
    ? PREFERRED_NATIVE_SUPABASE_REDIRECT || undefined
    : PREFERRED_WEB_SUPABASE_REDIRECT || undefined);

function normalizeComparablePath(pathname) {
  const normalized = String(pathname || "").trim().replace(/\/+$/, "");
  return normalized || "/";
}

export function isNativeSupabaseRedirectUrl(value) {
  if (!Capacitor.isNativePlatform()) return false;
  if (!SUPABASE_REDIRECT || /^https?:/i.test(SUPABASE_REDIRECT)) return false;

  try {
    const incoming = new URL(String(value || "").trim());
    const expected = new URL(SUPABASE_REDIRECT);
    return (
      incoming.protocol === expected.protocol &&
      incoming.host === expected.host &&
      normalizeComparablePath(incoming.pathname) === normalizeComparablePath(expected.pathname)
    );
  } catch {
    return false;
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are missing: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY");
}

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const requireSupabase = () => {
  if (!supabase) throw new Error("Supabase client is not initialized. Check environment variables.");
  return supabase;
};

const requireUser = (userId) => {
  if (!userId) throw new Error("User ID is required.");
  return userId;
};

const STORAGE_FILE_NAME_FALLBACK = "document.pdf";
const STORAGE_CONTENT_TYPE_BY_EXT = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const getLowerFileExtension = (fileName) => {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized) return "";
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return "";
  return normalized.slice(dotIndex + 1);
};

const resolveStorageContentType = (file) => {
  const rawType = String(file?.type || "").trim().toLowerCase();
  if (rawType) return rawType;
  const ext = getLowerFileExtension(file?.name);
  return STORAGE_CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
};

const toSafeStorageFileName = (fileName) => {
  const rawName = String(fileName || "").trim();
  const noPath = rawName.replace(/[\\/]+/g, "-");
  const normalized = noPath.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
  const asciiOnly = normalized
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  if (!asciiOnly) return STORAGE_FILE_NAME_FALLBACK;

  const ext = getLowerFileExtension(asciiOnly);
  if (!ext) return `${asciiOnly}.pdf`;
  return asciiOnly;
};

export async function signInWithEmail(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function signInWithProvider(provider) {
  const client = requireSupabase();
  const options = {
    queryParams: {
      prompt: "consent",
      access_type: "offline",
    },
  };

  if (SUPABASE_REDIRECT) {
    options.redirectTo = SUPABASE_REDIRECT;
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options,
  });
  if (error) throw error;
  return data;
}

export async function getAccessToken() {
  if (!supabase) return "";
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return String(data?.session?.access_token || "").trim();
}

export async function uploadPdfToStorage(userId, file) {
  const client = requireSupabase();
  requireUser(userId);
  if (!file) throw new Error("File is required.");

  const safeName = toSafeStorageFileName(file.name);
  const uniqueSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${userId}/${Date.now()}-${uniqueSuffix}-${safeName}`;
  const contentType = resolveStorageContentType(file);
  const { error } = await client.storage
    .from(supabaseBucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw error;

  // Upload is complete; create a signed URL for immediate preview (7 days).
  const { data: signedData, error: signedError } = await client.storage
    .from(supabaseBucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedError) throw signedError;

  return { path, signedUrl: signedData?.signedUrl || null, bucket: supabaseBucket };
}

export async function saveMockExam({ userId, docId, docName, title, totalQuestions, payload }) {
  const client = requireSupabase();
  requireUser(userId);
  const body = {
    user_id: userId,
    doc_id: docId,
    doc_name: docName,
    title: title || "",
    total_questions: totalQuestions ?? null,
    payload: payload || null,
  };
  const { data, error } = await client.from(MOCK_EXAMS_TABLE).insert(body).select().single();
  if (error) throw error;
  return data;
}

export async function fetchMockExams({ userId, docId }) {
  const client = requireSupabase();
  if (!userId || !docId) return [];
  const { data, error } = await client
    .from(MOCK_EXAMS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteMockExam({ userId, examId }) {
  const client = requireSupabase();
  if (!userId || !examId) return;
  const { error } = await client.from(MOCK_EXAMS_TABLE).delete().eq("id", examId).eq("user_id", userId);
  if (error) throw error;
}

export async function addFlashcard({ userId, deckId, front, back, hint }) {
  const client = requireSupabase();
  requireUser(userId);
  const payload = {
    user_id: userId,
    deck_id: deckId,
    front: front || "",
    back: back || "",
    hint: hint || "",
  };
  const { data, error } = await client.from(FLASHCARDS_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function addFlashcards({ userId, deckId, cards }) {
  const client = requireSupabase();
  requireUser(userId);
  const normalized = Array.isArray(cards)
    ? cards
        .map((card) => ({
          user_id: userId,
          deck_id: deckId,
          front: card?.front || "",
          back: card?.back || "",
          hint: card?.hint || "",
        }))
        .filter((card) => card.front && card.back)
    : [];
  if (normalized.length === 0) return [];
  const { data, error } = await client.from(FLASHCARDS_TABLE).insert(normalized).select();
  if (error) throw error;
  return data || [];
}

export async function listFlashcards({ userId, deckId }) {
  if (!supabase || !userId) return [];
  const query = supabase.from(FLASHCARDS_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (deckId) query.eq("deck_id", deckId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function deleteFlashcard({ userId, cardId }) {
  const client = requireSupabase();
  if (!userId || !cardId) return;
  const { error } = await client.from(FLASHCARDS_TABLE).delete().eq("id", cardId).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteUpload({ userId, uploadId, bucket, path, previewPdfBucket, previewPdfPath }) {
  const client = requireSupabase();
  requireUser(userId);
  if (!uploadId && !path) return;

  // Best-effort storage cleanup before deleting DB metadata.
  const removals = [];
  if (bucket && path) {
    removals.push({ bucket, path });
  }
  if (previewPdfBucket && previewPdfPath) {
    removals.push({ bucket: previewPdfBucket, path: previewPdfPath });
  }

  for (const target of removals) {
    try {
      await client.storage.from(target.bucket).remove([target.path]);
    } catch (err) {
      console.warn("storage remove failed", err);
    }
  }

  let lastError = null;
  if (uploadId) {
    const { error } = await client.from(UPLOADS_TABLE).delete().eq("id", uploadId).eq("user_id", userId);
    if (!error) return;
    lastError = error;
  }

  // Fallback path-based delete when id-based delete did not remove rows.
  if (path) {
    const { error } = await client.from(UPLOADS_TABLE).delete().eq("storage_path", path).eq("user_id", userId);
    if (error) {
      throw error;
    }
    return;
  }

  if (lastError) throw lastError;
}

export async function createFolder({ userId, name }) {
  const client = requireSupabase();
  requireUser(userId);
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Folder name is required.");
  const payload = {
    user_id: userId,
    name: trimmed,
  };
  const { data, error } = await client.from("folders").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function listFolders({ userId }) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteFolder({ userId, folderId }) {
  const client = requireSupabase();
  requireUser(userId);
  if (!folderId) return;
  const { error } = await client.from("folders").delete().eq("id", folderId).eq("user_id", userId);
  if (error) throw error;
}

export async function renameFolder({ userId, folderId, name }) {
  const client = requireSupabase();
  requireUser(userId);
  const trimmedFolderId = String(folderId || "").trim();
  const trimmedName = String(name || "").trim();
  if (!trimmedFolderId) throw new Error("Folder ID is required.");
  if (!trimmedName) throw new Error("Folder name is required.");
  const { data, error } = await client
    .from("folders")
    .update({ name: trimmedName })
    .eq("id", trimmedFolderId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveUploadMetadata({ userId, fileName, fileSize, storagePath, bucket, thumbnail, fileHash, folderId }) {
  const client = requireSupabase();
  requireUser(userId);
  const payload = {
    user_id: userId,
    file_name: fileName,
    file_size: fileSize,
    storage_path: storagePath,
    bucket: bucket || supabaseBucket,
    thumbnail: thumbnail || null,
    file_hash: fileHash || null,
    folder_id: folderId || null,
    infolder: folderId ? 1 : 0,
  };
  const { data, error } = await client.from(UPLOADS_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function listUploads({ userId }) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from(UPLOADS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getSignedStorageUrl({ bucket, path, expiresIn = 60 * 60 * 24 }) {
  const client = requireSupabase();
  const targetBucket = bucket || supabaseBucket;
  const { data, error } = await client.storage.from(targetBucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl;
}

export async function updateUploadThumbnail({ id, thumbnail }) {
  const client = requireSupabase();
  if (!id) throw new Error("Upload ID is required.");
  const { error } = await client
    .from(UPLOADS_TABLE)
    .update({ thumbnail })
    .eq("id", id);
  if (error) throw error;
  return null;
}

export async function updateUploadFolder({ userId, uploadIds = [], folderId = null, storagePaths = [] }) {
  const client = requireSupabase();
  requireUser(userId);
  const ids = Array.isArray(uploadIds) ? uploadIds.filter(Boolean) : [];
  const paths = Array.isArray(storagePaths) ? storagePaths.filter(Boolean) : [];
  if (ids.length === 0 && paths.length === 0) return [];

  const updates = { folder_id: folderId || null, infolder: folderId ? 1 : 0 };
  let results = [];

  if (ids.length > 0) {
    const { data, error } = await client
      .from(UPLOADS_TABLE)
      .update(updates)
      .in("id", ids)
      .eq("user_id", userId)
      .select();
    if (error) throw error;
    results = data || [];
  }

  const pendingPaths = paths.filter((p) => !results.some((row) => row.storage_path === p));
  if (pendingPaths.length > 0) {
    const { data, error } = await client
      .from(UPLOADS_TABLE)
      .update(updates)
      .in("storage_path", pendingPaths)
      .eq("user_id", userId)
      .select();
    if (error) throw error;
    results = [...results, ...(data || [])];
  }

  // If no rows were updated, this is usually a permission/RLS issue.
  if ((results || []).length === 0) {
    throw new Error("Folder move failed. Check permissions or RLS policy.");
  }
  return results;
}

export async function fetchDocArtifacts({ userId, docId }) {
  if (!supabase || !userId || !docId) return null;
  const { data, error } = await supabase
    .from(ARTIFACTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveDocArtifacts({ userId, docId, summary, quiz, ox, highlights, extractedText, extractedTextMetadata }) {
  const client = requireSupabase();
  if (!userId || !docId) throw new Error("userId and docId are required.");
  const payload = {
    user_id: userId,
    doc_id: docId,
  };

  if (summary !== undefined) payload.summary = summary;
  if (quiz !== undefined) payload.quiz_json = quiz;
  if (ox !== undefined) payload.ox_json = ox;
  if (highlights !== undefined) payload.highlights_json = highlights;
  
  // OCR 텍스트 추가
  if (extractedText !== undefined) {
    payload.extracted_text = extractedText;
    payload.extracted_text_metadata = extractedTextMetadata || {};
    payload.extracted_at = new Date().toISOString();
    payload.text_size_bytes = new Blob([extractedText]).size;
  }

  const { data, error } = await client
    .from(ARTIFACTS_TABLE)
    .upsert(payload, { onConflict: "user_id,doc_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// OCR 텍스트 저장 함수
export async function saveExtractedText({ userId, docId, extractedText, metadata = {} }) {
  const client = requireSupabase();
  if (!userId || !docId || !extractedText) {
    throw new Error("userId, docId, and extractedText are required.");
  }
  
  const payload = {
    user_id: userId,
    doc_id: docId,
    extracted_text: extractedText,
    extracted_text_metadata: metadata,
    extracted_at: new Date().toISOString(),
    text_size_bytes: new Blob([extractedText]).size,
  };
  
  const { data, error } = await client
    .from(ARTIFACTS_TABLE)
    .upsert(payload, { onConflict: "user_id,doc_id" })
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

// OCR 텍스트 조회 함수
export async function fetchExtractedText({ userId, docId }) {
  const client = requireSupabase();
  if (!userId || !docId) return null;
  
  const { data, error } = await client
    .from(ARTIFACTS_TABLE)
    .select("extracted_text, extracted_text_metadata, extracted_at, text_size_bytes")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .maybeSingle();
    
  if (error) throw error;
  return data;
}

// 백필 마이그레이션 함수
export async function backfillOcrText({ userId, docId, extractedText, metadata = {} }) {
  const client = requireSupabase();
  
  // 저장 프로시저 호출 (SQL 함수)
  const { data, error } = await client.rpc('backfill_ocr_text_for_document', {
    p_user_id: userId,
    p_doc_id: docId,
    p_extracted_text: extractedText,
    p_metadata: metadata,
  });
  
  if (error) throw error;
  return data;
}

function isPaidTier(tier) {
  return PAID_TIERS.has(String(tier || "").trim().toLowerCase());
}

function isTierExpiryColumnError(error) {
  if (!error) return false;
  const code = String(error?.code || "");
  if (code === "42703" || code === "PGRST204") return true;
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return text.includes(TIER_EXPIRY_COLUMN);
}

function toIsoStringOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addMonthsUtc(dateInput, monthsInput = 1) {
  const baseDate = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  const parsedMonths = Number(monthsInput);
  const safeMonths = Number.isFinite(parsedMonths) && parsedMonths > 0 ? Math.floor(parsedMonths) : 1;
  if (Number.isNaN(baseDate.getTime())) return new Date();
  const next = new Date(baseDate);
  next.setUTCMonth(next.getUTCMonth() + safeMonths);
  return next;
}

function buildTierStatus(tier, tierExpiresAtRaw) {
  const normalizedTier = ALLOWED_TIERS.includes(tier) ? tier : DEFAULT_TIER;
  const expiresIso = toIsoStringOrNull(tierExpiresAtRaw);
  const now = Date.now();
  if (!isPaidTier(normalizedTier) || !expiresIso) {
    return {
      tier: normalizedTier,
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
    tierRemainingDays: Math.max(1, Math.ceil(remainingMs / MS_PER_DAY)),
    isExpired: false,
  };
}

async function fetchUserTierRow(client, userId) {
  const selectWithExpiry = `tier, ${TIER_EXPIRY_COLUMN}`;
  const { data, error } = await client
    .from(USER_TIER_TABLE)
    .select(selectWithExpiry)
    .eq("user_id", userId)
    .single();

  if (!error) {
    return {
      row: data || null,
      hasExpiryColumn: true,
    };
  }
  if (error.code === "PGRST116") {
    return {
      row: null,
      hasExpiryColumn: true,
    };
  }
  if (!isTierExpiryColumnError(error)) throw error;

  const { data: fallbackData, error: fallbackError } = await client
    .from(USER_TIER_TABLE)
    .select("tier")
    .eq("user_id", userId)
    .single();
  if (fallbackError && fallbackError.code !== "PGRST116") throw fallbackError;
  return {
    row: fallbackData ? { ...fallbackData, [TIER_EXPIRY_COLUMN]: null } : null,
    hasExpiryColumn: false,
  };
}

async function upsertUserTierRow({
  client,
  userId,
  tier,
  tierExpiresAt = null,
  hasExpiryColumn = true,
}) {
  const payload = { user_id: userId, tier };
  if (hasExpiryColumn) payload[TIER_EXPIRY_COLUMN] = tierExpiresAt;

  const selectClause = hasExpiryColumn ? `tier, ${TIER_EXPIRY_COLUMN}` : "tier";
  const { data, error } = await client
    .from(USER_TIER_TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select(selectClause)
    .single();

  if (error && hasExpiryColumn && isTierExpiryColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await client
      .from(USER_TIER_TABLE)
      .upsert({ user_id: userId, tier }, { onConflict: "user_id" })
      .select("tier")
      .single();
    if (fallbackError) throw fallbackError;
    return {
      row: fallbackData ? { ...fallbackData, [TIER_EXPIRY_COLUMN]: null } : null,
      hasExpiryColumn: false,
    };
  }

  if (error) throw error;
  return {
    row: data || null,
    hasExpiryColumn,
  };
}

function getBaseDateForTierExtension({ tier, existingRow }) {
  const now = new Date();
  if (!existingRow) return now;
  const existingTier = existingRow?.tier;
  const existingExpiryIso = toIsoStringOrNull(existingRow?.[TIER_EXPIRY_COLUMN]);
  if (existingTier !== tier || !existingExpiryIso) return now;
  const existingExpiryMs = Date.parse(existingExpiryIso);
  if (!Number.isFinite(existingExpiryMs) || existingExpiryMs <= now.getTime()) return now;
  return new Date(existingExpiryIso);
}

function resolveTierExpiryAt({
  tier,
  requestedExpiresAt = null,
  existingRow = null,
  extendMonths = null,
}) {
  if (!isPaidTier(tier)) return null;
  const normalizedRequested = toIsoStringOrNull(requestedExpiresAt);
  if (normalizedRequested) return normalizedRequested;

  const defaultMonths = PAID_TIER_TERM_MONTHS[tier] || 1;
  const months =
    Number.isFinite(Number(extendMonths)) && Number(extendMonths) > 0
      ? Number(extendMonths)
      : defaultMonths;
  const baseDate = getBaseDateForTierExtension({ tier, existingRow });
  return addMonthsUtc(baseDate, months).toISOString();
}

export async function getUserTierStatus({ userId }) {
  const client = requireSupabase();
  if (!userId) throw new Error("userId is required.");

  const { row, hasExpiryColumn } = await fetchUserTierRow(client, userId);
  const tier = row?.tier;

  if (!ALLOWED_TIERS.includes(tier)) {
    try {
      await upsertUserTierRow({
        client,
        userId,
        tier: DEFAULT_TIER,
        tierExpiresAt: null,
        hasExpiryColumn,
      });
    } catch (upsertErr) {
      console.warn("Failed to ensure user tier row", upsertErr);
    }
    return {
      tier: DEFAULT_TIER,
      tierExpiresAt: null,
      tierRemainingDays: null,
      isExpired: false,
    };
  }

  const status = buildTierStatus(tier, row?.[TIER_EXPIRY_COLUMN]);
  if (!status.isExpired) return status;

  // Expired paid plan -> downgrade to free immediately.
  try {
    await upsertUserTierRow({
      client,
      userId,
      tier: DEFAULT_TIER,
      tierExpiresAt: null,
      hasExpiryColumn,
    });
  } catch (downgradeErr) {
    console.warn("Failed to downgrade expired tier", downgradeErr);
  }

  return {
    tier: DEFAULT_TIER,
    tierExpiresAt: null,
    tierRemainingDays: null,
    isExpired: true,
  };
}

export async function getUserTier({ userId }) {
  const status = await getUserTierStatus({ userId });
  return status.tier;
}

export async function setUserTier({ userId, tier, expiresAt = null, extendMonths = null }) {
  const client = requireSupabase();
  if (!userId) throw new Error("userId is required.");
  if (!ALLOWED_TIERS.includes(tier)) {
    throw new Error(`tier must be one of: ${ALLOWED_TIERS.join(", ")}`);
  }

  const { row: currentRow, hasExpiryColumn } = await fetchUserTierRow(client, userId);
  const tierExpiresAt = resolveTierExpiryAt({
    tier,
    requestedExpiresAt: expiresAt,
    existingRow: currentRow,
    extendMonths,
  });

  const { row: updatedRow } = await upsertUserTierRow({
    client,
    userId,
    tier,
    tierExpiresAt,
    hasExpiryColumn,
  });
  return updatedRow?.tier || tier;
}
export async function saveUserFeedback({
  userId,
  userEmail = "",
  userName = "",
  category = "general",
  content,
  docId = null,
  docName = "",
  panel = "",
  metadata = null,
}) {
  const client = requireSupabase();
  requireUser(userId);
  const trimmedContent = String(content || "").trim();
  if (!trimmedContent) {
    throw new Error("Feedback content is required.");
  }

  const payload = {
    user_id: userId,
    user_email: userEmail || "",
    user_name: userName || "",
    category: String(category || "general").trim() || "general",
    content: trimmedContent,
    doc_id: docId || null,
    doc_name: docName || "",
    panel: panel || "",
    metadata_json: metadata || null,
  };

  let result = await client.from(FEEDBACK_TABLE).insert(payload).select().single();
  if (
    result.error &&
    `${result.error?.message || ""} ${result.error?.details || ""} ${result.error?.hint || ""}`.match(
      /user_email|user_name/i
    )
  ) {
    const fallbackPayload = {
      user_id: userId,
      category: String(category || "general").trim() || "general",
      content: trimmedContent,
      doc_id: docId || null,
      doc_name: docName || "",
      panel: panel || "",
      metadata_json: metadata || null,
    };
    result = await client.from(FEEDBACK_TABLE).insert(fallbackPayload).select().single();
  }

  const { data, error } = result;
  if (error) throw error;
  return data;
}

export function getPremiumProfileStateFromUser(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const profiles = Array.isArray(metadata?.[PREMIUM_PROFILES_META_KEY]) ? metadata[PREMIUM_PROFILES_META_KEY] : [];
  const activeProfileId = metadata?.[PREMIUM_ACTIVE_PROFILE_META_KEY];
  const spaceMode = metadata?.[PREMIUM_SPACE_MODE_META_KEY];
  return {
    profiles,
    activeProfileId: typeof activeProfileId === "string" ? activeProfileId : "",
    spaceMode: typeof spaceMode === "string" ? spaceMode : "",
  };
}

export async function savePremiumProfileState({
  profiles = [],
  activeProfileId = null,
  spaceMode = "profile",
} = {}) {
  const client = requireSupabase();
  const payload = {
    [PREMIUM_PROFILES_META_KEY]: Array.isArray(profiles) ? profiles : [],
    [PREMIUM_ACTIVE_PROFILE_META_KEY]:
      typeof activeProfileId === "string" && activeProfileId.trim() ? activeProfileId.trim() : null,
    [PREMIUM_SPACE_MODE_META_KEY]:
      typeof spaceMode === "string" && spaceMode.trim() ? spaceMode.trim() : "profile",
  };

  const { data, error } = await client.auth.updateUser({ data: payload });
  if (error) throw error;
  return data?.user || null;
}
