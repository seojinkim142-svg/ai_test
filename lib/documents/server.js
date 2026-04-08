/* global process */
import { authenticateSupabaseUserFromRequest, getSupabaseAdminClient } from "../billing/tier-sync.js";

const DEFAULT_UPLOADS_TABLE = "uploads";
const DEFAULT_BUCKET = "pdf-uploads";
const LOCAL_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);
const CONVERTIBLE_EXTENSIONS = new Set(["docx", "pptx"]);
const PREVIEW_PATH_SEGMENT = "preview-pdf";

export const text = (value) => String(value ?? "").trim();

const normalizeOrigin = (value) => {
  const raw = text(value);
  if (!raw) return "";
  if (raw === "*") return "*";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const parseAllowedOrigins = (...values) => {
  const origins = new Set();
  values.forEach((value) => {
    String(value || "")
      .split(/[,\s]+/)
      .map((entry) => normalizeOrigin(entry))
      .filter(Boolean)
      .forEach((origin) => origins.add(origin));
  });
  return origins;
};

const readRequestStream = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

export const parseRequestBody = async (req) => {
  if (req.body != null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    if (Buffer.isBuffer(req.body)) {
      const parsed = req.body.toString("utf8").trim();
      return parsed ? JSON.parse(parsed) : {};
    }
    if (typeof req.body === "string") {
      const parsed = req.body.trim();
      return parsed ? JSON.parse(parsed) : {};
    }
  }

  const raw = (await readRequestStream(req)).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
};

const resolveRequestOrigin = (req) => {
  const directOrigin = text(req?.headers?.origin).split(",")[0];
  if (directOrigin) return directOrigin;

  const forwardedProto = text(req?.headers?.["x-forwarded-proto"]).split(",")[0];
  const forwardedHost = text(req?.headers?.["x-forwarded-host"]).split(",")[0];
  const host = text(req?.headers?.host).split(",")[0];
  const resolvedHost = forwardedHost || host;
  if (!resolvedHost) return "";

  const protocol =
    forwardedProto || (resolvedHost.startsWith("localhost") || resolvedHost.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${resolvedHost}`;
};

export const resolveAllowOrigin = (req) => {
  const requestOrigin = normalizeOrigin(resolveRequestOrigin(req));
  const allowedOrigins = parseAllowedOrigins(
    process.env.DOCUMENT_ALLOW_ORIGIN,
    process.env.VITE_PUBLIC_APP_ORIGIN,
    "http://localhost",
    "https://localhost",
    "capacitor://localhost"
  );

  if (requestOrigin && (allowedOrigins.has(requestOrigin) || LOCAL_ORIGINS.has(requestOrigin))) {
    return requestOrigin;
  }
  if (allowedOrigins.has("*")) return "*";

  const firstAllowed = [...allowedOrigins][0];
  return firstAllowed || requestOrigin || "*";
};

export const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  Vary: "Origin",
});

export const sendJson = (res, statusCode, body, allowOrigin) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  });
  res.end(JSON.stringify(body));
};

const getLowerFileExtension = (fileName) => {
  const normalized = text(fileName).toLowerCase();
  if (!normalized) return "";
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return "";
  return normalized.slice(dotIndex + 1);
};

const isConvertibleOfficeFile = (fileName) => CONVERTIBLE_EXTENSIONS.has(getLowerFileExtension(fileName));

const stripLeadingSlashes = (value) => text(value).replace(/^\/+/, "");

const replaceFileExtensionWithPdf = (fileName) => {
  const normalized = text(fileName);
  const ext = getLowerFileExtension(normalized);
  if (!ext) return `${normalized || "document"}.pdf`;
  return normalized.slice(0, -ext.length - 1) + ".pdf";
};

const buildPreviewPdfPath = (storagePath, fallbackFileName = "") => {
  const normalizedPath = stripLeadingSlashes(storagePath);
  if (!normalizedPath) return "";

  const segments = normalizedPath.split("/").filter(Boolean);
  const rawFileName = segments.pop() || text(fallbackFileName) || "document";
  const pdfFileName = replaceFileExtensionWithPdf(rawFileName);
  const parentSegments = segments.length > 0 ? segments : ["documents"];
  return [...parentSegments, PREVIEW_PATH_SEGMENT, pdfFileName].join("/");
};

const resolveUploadsTable = () =>
  text(process.env.SUPABASE_UPLOADS_TABLE || process.env.VITE_SUPABASE_UPLOADS_TABLE) || DEFAULT_UPLOADS_TABLE;

const resolveStorageBucket = (value) =>
  text(value || process.env.SUPABASE_BUCKET || process.env.VITE_SUPABASE_BUCKET) || DEFAULT_BUCKET;

const resolveConverterBaseUrl = () =>
  text(process.env.GOTENBERG_BASE_URL || process.env.DOCUMENT_CONVERTER_BASE_URL).replace(/\/+$/, "");

const resolveConverterTimeoutMs = () => {
  const parsed = Number(process.env.DOCUMENT_CONVERTER_TIMEOUT_MS || 120000);
  if (!Number.isFinite(parsed) || parsed < 5000) return 120000;
  return Math.floor(parsed);
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const isPreviewColumnMissingError = (error) => {
  if (!error) return false;
  const code = text(error?.code);
  if (code === "42703" || code === "PGRST204") return true;
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes("preview_pdf_path") || message.includes("preview_pdf_bucket");
};

const fetchUploadRow = async ({ client, userId, uploadId }) => {
  const { data, error } = await client
    .from(resolveUploadsTable())
    .select("id, user_id, file_name, bucket, storage_path, preview_pdf_path, preview_pdf_bucket")
    .eq("id", uploadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (isPreviewColumnMissingError(error)) {
    throw new Error(
      "Uploads table is missing preview_pdf_path/preview_pdf_bucket columns. Run the SQL migration first."
    );
  }
  if (error) throw error;
  return data || null;
};

const fetchStorageBlob = async ({ client, bucket, path }) => {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Failed to download the original document from storage.");
  }
  return data;
};

const convertOfficeBlobToPdf = async ({ blob, fileName }) => {
  const converterBaseUrl = resolveConverterBaseUrl();
  if (!converterBaseUrl) {
    throw new Error("GOTENBERG_BASE_URL (or DOCUMENT_CONVERTER_BASE_URL) is required.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), resolveConverterTimeoutMs());

  try {
    const form = new FormData();
    form.append("files", blob, fileName || "document.docx");
    form.append("updateIndexes", "true");
    form.append("exportBookmarks", "true");

    const response = await fetch(`${converterBaseUrl}/forms/libreoffice/convert`, {
      method: "POST",
      headers: {
        "Gotenberg-Output-Filename": replaceFileExtensionWithPdf(fileName || "document.docx").replace(/\.pdf$/i, ""),
      },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = text(await response.text());
      throw new Error(responseText || `Document conversion failed with HTTP ${response.status}.`);
    }

    const pdfBytes = Buffer.from(await response.arrayBuffer());
    if (pdfBytes.length === 0) {
      throw new Error("Converted PDF is empty.");
    }
    return pdfBytes;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Document conversion timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const uploadPreviewPdf = async ({ client, bucket, previewPath, pdfBytes }) => {
  const uploadBody = new Blob([pdfBytes], { type: "application/pdf" });
  const { error } = await client.storage.from(bucket).upload(previewPath, uploadBody, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
};

const createPreviewSignedUrl = async ({ client, bucket, previewPath }) => {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(previewPath, 60 * 60 * 24 * 7);
  if (error) throw error;
  return text(data?.signedUrl);
};

const updateUploadPreviewMetadata = async ({ client, userId, uploadId, previewPath, previewBucket }) => {
  const { data, error } = await client
    .from(resolveUploadsTable())
    .update({
      preview_pdf_path: previewPath,
      preview_pdf_bucket: previewBucket,
    })
    .eq("id", uploadId)
    .eq("user_id", userId)
    .select("id, preview_pdf_path, preview_pdf_bucket")
    .maybeSingle();

  if (isPreviewColumnMissingError(error)) {
    throw new Error(
      "Uploads table is missing preview_pdf_path/preview_pdf_bucket columns. Run the SQL migration first."
    );
  }
  if (error) throw error;
  return data || null;
};

export async function ensureUploadPreviewPdf({
  userId,
  uploadId,
  bucket = "",
  storagePath = "",
  fileName = "",
  force = false,
} = {}) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const normalizedUserId = text(userId);
  const normalizedUploadId = text(uploadId);
  if (!normalizedUserId || !normalizedUploadId) {
    throw new Error("userId and uploadId are required.");
  }

  const uploadRow = await fetchUploadRow({
    client,
    userId: normalizedUserId,
    uploadId: normalizedUploadId,
  });
  if (!uploadRow) {
    throw new Error("Upload not found or access denied.");
  }

  const normalizedBucket = resolveStorageBucket(bucket || uploadRow.bucket);
  const normalizedPath = stripLeadingSlashes(storagePath || uploadRow.storage_path);
  const normalizedFileName = text(fileName || uploadRow.file_name || normalizedPath.split("/").pop());
  if (!normalizedPath || !normalizedFileName) {
    throw new Error("Upload storage path or file name is missing.");
  }
  if (!isConvertibleOfficeFile(normalizedFileName)) {
    throw new Error("Only DOCX and PPTX files can be converted to preview PDF.");
  }

  const currentPreviewPath = stripLeadingSlashes(uploadRow.preview_pdf_path);
  const currentPreviewBucket = resolveStorageBucket(uploadRow.preview_pdf_bucket || normalizedBucket);
  if (currentPreviewPath && !parseBoolean(force)) {
    const signedUrl = await createPreviewSignedUrl({
      client,
      bucket: currentPreviewBucket,
      previewPath: currentPreviewPath,
    });
    return {
      ok: true,
      converted: false,
      uploadId: normalizedUploadId,
      previewPdfPath: currentPreviewPath,
      previewPdfBucket: currentPreviewBucket,
      signedUrl,
    };
  }

  const sourceBlob = await fetchStorageBlob({
    client,
    bucket: normalizedBucket,
    path: normalizedPath,
  });
  const sourceMime =
    getLowerFileExtension(normalizedFileName) === "pptx"
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const sourceBytes = Buffer.from(await sourceBlob.arrayBuffer());
  const normalizedBlob = new Blob([sourceBytes], { type: sourceMime });
  const pdfBytes = await convertOfficeBlobToPdf({
    blob: normalizedBlob,
    fileName: normalizedFileName,
  });

  const previewPdfPath = buildPreviewPdfPath(normalizedPath, normalizedFileName);
  const previewPdfBucket = resolveStorageBucket(currentPreviewBucket || normalizedBucket);
  await uploadPreviewPdf({
    client,
    bucket: previewPdfBucket,
    previewPath: previewPdfPath,
    pdfBytes,
  });
  await updateUploadPreviewMetadata({
    client,
    userId: normalizedUserId,
    uploadId: normalizedUploadId,
    previewPath: previewPdfPath,
    previewBucket: previewPdfBucket,
  });

  const signedUrl = await createPreviewSignedUrl({
    client,
    bucket: previewPdfBucket,
    previewPath: previewPdfPath,
  });
  return {
    ok: true,
    converted: true,
    uploadId: normalizedUploadId,
    previewPdfPath,
    previewPdfBucket,
    signedUrl,
  };
}

export async function handleDocumentPreviewConversionRequest(req, res) {
  const allowOrigin = resolveAllowOrigin(req);

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
  if (!authResult?.ok) {
    sendJson(res, authResult?.status || 401, { message: authResult?.message || "Unauthorized." }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
    return;
  }

  try {
    const result = await ensureUploadPreviewPdf({
      userId: authResult.userId,
      uploadId: body?.uploadId,
      bucket: body?.bucket,
      storagePath: body?.storagePath,
      fileName: body?.fileName,
      force: body?.force,
    });
    sendJson(res, 200, result, allowOrigin);
  } catch (error) {
    const message = text(error?.message || "Document preview conversion failed.");
    const status =
      /not found|access denied/i.test(message) ? 404 : /only docx and pptx/i.test(message) ? 400 : 500;
    sendJson(res, status, { message }, allowOrigin);
  }
}
