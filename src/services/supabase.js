import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET || "pdf-uploads";
const BOOKMARKS_TABLE = "bookmarks";
const FLASHCARDS_TABLE = import.meta.env.VITE_SUPABASE_FLASHCARDS_TABLE || "flashcards";
const UPLOADS_TABLE = import.meta.env.VITE_SUPABASE_UPLOADS_TABLE || "uploads";
const ARTIFACTS_TABLE = import.meta.env.VITE_SUPABASE_ARTIFACTS_TABLE || "artifacts";
const USER_TIER_TABLE = import.meta.env.VITE_SUPABASE_USER_TIER_TABLE || "user_tiers";
const ALLOWED_TIERS = ["free", "pro", "premium"];
export const DEFAULT_TIER = "free";
const SUPABASE_REDIRECT =
  import.meta.env.VITE_SUPABASE_REDIRECT_URL ||
  (typeof window !== "undefined" ? `${window.location.origin}/` : undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.");
}

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const requireSupabase = () => {
  if (!supabase) throw new Error("Supabase 클라이언트가 초기화되지 않았습니다.");
  return supabase;
};

const requireUser = (userId) => {
  if (!userId) throw new Error("로그인 정보가 없습니다.");
  return userId;
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
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: SUPABASE_REDIRECT,
      queryParams: {
        prompt: "consent",
        access_type: "offline",
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function uploadPdfToStorage(userId, file) {
  const client = requireSupabase();
  requireUser(userId);
  if (!file) throw new Error("업로드할 파일이 없습니다.");

  const safeName = file.name.replace(/\s+/g, "-");
  const path = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await client.storage
    .from(supabaseBucket)
    .upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
  if (error) throw error;

  // 프라이빗 버킷을 가정하고, 읽기용 서명 URL을 발급 (7일 유효)
  const { data: signedData, error: signedError } = await client.storage
    .from(supabaseBucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedError) throw signedError;

  return { path, signedUrl: signedData?.signedUrl || null, bucket: supabaseBucket };
}

export async function saveBookmark({ userId, docId, docName, pageNumber, note }) {
  const client = requireSupabase();
  requireUser(userId);
  const payload = {
    user_id: userId,
    doc_id: docId,
    doc_name: docName,
    page_number: pageNumber,
    note: note || "",
  };
  const { data, error } = await client.from(BOOKMARKS_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function fetchBookmarks({ userId, docId }) {
  const client = requireSupabase();
  if (!userId || !docId) return [];
  const { data, error } = await client
    .from(BOOKMARKS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteBookmark({ userId, bookmarkId }) {
  const client = requireSupabase();
  if (!userId || !bookmarkId) return;
  const { error } = await client.from(BOOKMARKS_TABLE).delete().eq("id", bookmarkId).eq("user_id", userId);
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
  if (!id) throw new Error("업로드 ID가 필요합니다.");
  const { error } = await client
    .from(UPLOADS_TABLE)
    .update({ thumbnail })
    .eq("id", id);
  if (error) throw error;
  return null;
}

export async function updateUploadFolder({ userId, uploadIds = [], folderId = null }) {
  const client = requireSupabase();
  requireUser(userId);
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return [];
  const { data, error } = await client
    .from(UPLOADS_TABLE)
    .update({ folder_id: folderId || null })
    .in("id", uploadIds)
    .eq("user_id", userId)
    .select();
  if (error) throw error;
  return data || [];
}

export async function fetchDocArtifacts({ userId, docId }) {
  if (!supabase || !userId || !docId) return null;
  const { data, error } = await supabase
    .from(ARTIFACTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .single();
  if (error && error.code !== "PGRST116") throw error; // no rows is fine
  return data || null;
}

export async function saveDocArtifacts({ userId, docId, summary, quiz, ox, highlights }) {
  const client = requireSupabase();
  if (!userId || !docId) throw new Error("userId와 docId가 필요합니다.");
  const payload = {
    user_id: userId,
    doc_id: docId,
  };

  if (summary !== undefined) payload.summary = summary;
  if (quiz !== undefined) payload.quiz_json = quiz;
  if (ox !== undefined) payload.ox_json = ox;
  if (highlights !== undefined) payload.highlights_json = highlights;

  const { data, error } = await client
    .from(ARTIFACTS_TABLE)
    .upsert(payload, { onConflict: "user_id,doc_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserTier({ userId }) {
  const client = requireSupabase();
  if (!userId) throw new Error("userId가 필요합니다.");
  const { data, error } = await client
    .from(USER_TIER_TABLE)
    .select("tier")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error; // no rows is fine
  const tier = data?.tier;
  if (ALLOWED_TIERS.includes(tier)) return tier;

  // 기본값을 DB에 생성 후 반환 (최초 로그인 시 자동 free 등록)
  try {
    const { data: inserted, error: upsertError } = await client
      .from(USER_TIER_TABLE)
      .upsert({ user_id: userId, tier: DEFAULT_TIER }, { onConflict: "user_id" })
      .select("tier")
      .single();
    if (upsertError) throw upsertError;
    return inserted?.tier || DEFAULT_TIER;
  } catch (upsertErr) {
    // eslint-disable-next-line no-console
    console.warn("Failed to ensure user tier row", upsertErr);
    return DEFAULT_TIER;
  }
}

export async function setUserTier({ userId, tier }) {
  const client = requireSupabase();
  if (!userId) throw new Error("userId가 필요합니다.");
  if (!ALLOWED_TIERS.includes(tier)) {
    throw new Error(`tier는 ${ALLOWED_TIERS.join(", ")} 중 하나여야 합니다.`);
  }
  const payload = { user_id: userId, tier };
  const { data, error } = await client
    .from(USER_TIER_TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data?.tier || tier;
}
