import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getSupabaseAdminClient } from "../billing/tier-sync.js";
import {
  getFeedbackReplyTableName,
  getFeedbackTableName,
  isMissingColumnError,
  text,
  truncateText,
} from "./server.js";

const DEFAULT_IMAP_HOST = "imap.naver.com";
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_FETCH_COUNT = 100;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_SENT_MAILBOX_CANDIDATES = ["보낸메일함", "Sent", "Sent Messages", "Sent Mail", "Sent Items"];
const REPLY_MARKERS = [
  /^On .+wrote:$/i,
  /^보낸 사람:/,
  /^보낸날짜:/,
  /^발신:/,
  /^From:/i,
  /^Subject:/i,
  /^제목:/,
  /^-----Original Message-----$/i,
];

const normalizeInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const normalizeBoolean = (value, fallback = true) => {
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const parseMailboxCandidates = (value) => {
  const entries = String(value || "")
    .split(/[,\n]+/)
    .map((entry) => text(entry))
    .filter(Boolean);
  return entries.length ? entries : DEFAULT_SENT_MAILBOX_CANDIDATES;
};

const getRuntimeConfig = () => ({
  host: text(process.env.FEEDBACK_NAVER_IMAP_HOST || DEFAULT_IMAP_HOST),
  port: normalizeInteger(process.env.FEEDBACK_NAVER_IMAP_PORT, DEFAULT_IMAP_PORT),
  secure: normalizeBoolean(process.env.FEEDBACK_NAVER_IMAP_SECURE, true),
  user: text(process.env.FEEDBACK_NAVER_IMAP_USER),
  password: text(process.env.FEEDBACK_NAVER_IMAP_PASSWORD),
  sentMailboxCandidates: parseMailboxCandidates(process.env.FEEDBACK_NAVER_SENT_MAILBOXES),
  fetchCount: Math.min(500, normalizeInteger(process.env.FEEDBACK_NAVER_FETCH_COUNT, DEFAULT_FETCH_COUNT)),
  lookbackDays: Math.min(365, normalizeInteger(process.env.FEEDBACK_NAVER_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS)),
});

const isRuntimeReady = (config) => Boolean(config?.user && config?.password && config?.host && config?.port);

const flattenMailboxes = (mailboxes, acc = []) => {
  (Array.isArray(mailboxes) ? mailboxes : []).forEach((mailbox) => {
    if (mailbox) acc.push(mailbox);
    if (Array.isArray(mailbox?.children) && mailbox.children.length) {
      flattenMailboxes(mailbox.children, acc);
    }
  });
  return acc;
};

const resolveSentMailboxPath = (mailboxes, candidates) => {
  const flat = flattenMailboxes(mailboxes);
  const exactCandidate = flat.find((mailbox) => text(mailbox?.specialUse) === "\\Sent");
  if (exactCandidate?.path) return exactCandidate.path;

  const normalizedCandidates = (Array.isArray(candidates) ? candidates : [])
    .map((entry) => text(entry).toLowerCase())
    .filter(Boolean);

  for (const candidate of normalizedCandidates) {
    const exact = flat.find(
      (mailbox) =>
        text(mailbox?.path).toLowerCase() === candidate || text(mailbox?.name).toLowerCase() === candidate
    );
    if (exact?.path) return exact.path;
  }

  for (const candidate of normalizedCandidates) {
    const partial = flat.find(
      (mailbox) =>
        text(mailbox?.path).toLowerCase().includes(candidate) || text(mailbox?.name).toLowerCase().includes(candidate)
    );
    if (partial?.path) return partial.path;
  }

  return "";
};

const extractFeedbackIdFromSubject = (subject) => {
  const normalized = text(subject);
  if (!normalized) return 0;
  const match = normalized.match(/\[FB-(\d+)\]/i);
  return match ? Number(match[1]) : 0;
};

const stripQuotedText = (content) => {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";

  const lines = normalized.split("\n");
  const collected = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (REPLY_MARKERS.some((pattern) => pattern.test(trimmed))) break;
    if (trimmed.startsWith(">") && !collected.length) continue;
    collected.push(line);
  }

  return collected
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const extractReplyBody = (parsedMessage) => {
  const directText = stripQuotedText(parsedMessage?.text || "");
  if (directText) return directText;
  return stripQuotedText(parsedMessage?.html ? String(parsedMessage.html).replace(/<[^>]+>/g, " ") : "");
};

const findFeedbackById = async (client, feedbackId) => {
  const table = getFeedbackTableName();
  const result = await client
    .from(table)
    .select("id, user_id, category, content, doc_name, panel")
    .eq("id", feedbackId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
};

const replyExists = async (client, messageId) => {
  if (!messageId) return false;
  const table = getFeedbackReplyTableName();
  const result = await client.from(table).select("id").eq("source_message_id", messageId).maybeSingle();
  if (!result.error) return Boolean(result.data?.id);
  if (isMissingColumnError(result.error, "source_message_id")) return false;
  throw result.error;
};

const insertReplyRecord = async ({ client, feedbackId, responderEmail, content, createdAt, messageId, subject, mailboxPath }) => {
  const table = getFeedbackReplyTableName();
  const payload = {
    feedback_id: feedbackId,
    responder_email: responderEmail || "",
    content,
    created_at: createdAt || new Date().toISOString(),
    source_message_id: messageId || null,
    source_subject: subject || "",
    source_mailbox: mailboxPath || "",
    synced_at: new Date().toISOString(),
  };

  const result = await client.from(table).insert(payload).select("id").maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id || null;
};

const updateFeedbackSummary = async ({ client, feedbackId, content, createdAt }) => {
  const table = getFeedbackTableName();
  const payload = {
    status: "replied",
    last_replied_at: createdAt || new Date().toISOString(),
    last_reply_excerpt: truncateText(content, 180),
  };

  const result = await client.from(table).update(payload).eq("id", feedbackId).select("id").maybeSingle();
  if (result.error) {
    if (
      isMissingColumnError(result.error, "status") ||
      isMissingColumnError(result.error, "last_replied_at") ||
      isMissingColumnError(result.error, "last_reply_excerpt")
    ) {
      return false;
    }
    throw result.error;
  }
  return true;
};

const fetchRecentMessages = async ({ imapClient, mailboxPath, fetchCount, lookbackDays }) => {
  const mailbox = await imapClient.mailboxOpen(mailboxPath, { readOnly: true });
  const exists = Number(mailbox?.exists || 0);
  if (exists <= 0) return [];

  const start = Math.max(1, exists - fetchCount + 1);
  const range = `${start}:*`;
  const messages = await imapClient.fetchAll(range, {
    uid: true,
    envelope: true,
    source: true,
    internalDate: true,
  });

  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return (Array.isArray(messages) ? messages : []).filter((message) => {
    const internalDate = new Date(message?.internalDate || 0).getTime();
    return !Number.isFinite(internalDate) || internalDate >= since;
  });
};

export async function syncNaverFeedbackReplies({ fetchCount, lookbackDays } = {}) {
  const config = getRuntimeConfig();
  if (!isRuntimeReady(config)) {
    return {
      ok: false,
      skipped: true,
      message: "Naver IMAP settings are not configured.",
    };
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    throw new Error("Server Supabase config is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const imapClient = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });

  const results = [];
  let mailboxPath = "";

  try {
    await imapClient.connect();
    const mailboxes = await imapClient.list();
    mailboxPath = resolveSentMailboxPath(mailboxes, config.sentMailboxCandidates);
    if (!mailboxPath) {
      throw new Error("Naver sent mailbox could not be resolved. Set FEEDBACK_NAVER_SENT_MAILBOXES.");
    }

    const messages = await fetchRecentMessages({
      imapClient,
      mailboxPath,
      fetchCount: fetchCount || config.fetchCount,
      lookbackDays: lookbackDays || config.lookbackDays,
    });

    for (const message of messages) {
      const parsed = await simpleParser(message.source);
      const subject = text(parsed?.subject || message?.envelope?.subject);
      const feedbackId = extractFeedbackIdFromSubject(subject);
      if (!feedbackId) {
        results.push({ status: "ignored", reason: "subject_without_feedback_token", subject });
        continue;
      }

      const messageId = text(parsed?.messageId || message?.envelope?.messageId);
      if (messageId) {
        const exists = await replyExists(adminClient, messageId);
        if (exists) {
          results.push({ status: "ignored", reason: "already_synced", feedbackId, messageId });
          continue;
        }
      }

      const feedback = await findFeedbackById(adminClient, feedbackId);
      if (!feedback?.id) {
        results.push({ status: "ignored", reason: "feedback_not_found", feedbackId, subject });
        continue;
      }

      const replyBody = extractReplyBody(parsed);
      if (!replyBody) {
        results.push({ status: "ignored", reason: "empty_reply_body", feedbackId, subject });
        continue;
      }

      const responderEmail = text(parsed?.from?.value?.[0]?.address || parsed?.from?.text || config.user);
      const createdAt = new Date(parsed?.date || message?.internalDate || Date.now()).toISOString();

      await insertReplyRecord({
        client: adminClient,
        feedbackId,
        responderEmail,
        content: replyBody,
        createdAt,
        messageId,
        subject,
        mailboxPath,
      });

      await updateFeedbackSummary({
        client: adminClient,
        feedbackId,
        content: replyBody,
        createdAt,
      });

      results.push({
        status: "inserted",
        feedbackId,
        messageId,
        subject,
      });
    }

    return {
      ok: true,
      mailboxPath,
      processed: results.length,
      inserted: results.filter((entry) => entry.status === "inserted").length,
      ignored: results.filter((entry) => entry.status === "ignored").length,
      results,
    };
  } finally {
    try {
      await imapClient.logout();
    } catch {
      // noop
    }
  }
}

export const getNaverReplySyncConfig = () => getRuntimeConfig();
