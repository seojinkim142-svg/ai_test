const MB = 1024 * 1024;

export const PDF_MAX_SIZE_BY_TIER = {
  free: 10 * MB,
  pro: 25 * MB,
  premium: 25 * MB,
};

export const PREMIUM_SCOPE_PREFIX = "[[p:";
export const PREMIUM_SCOPE_SUFFIX = "]]";
export const PREMIUM_SHARED_SCOPE_ID = "__shared__";
export const PREMIUM_SPACE_MODE_PROFILE = "profile";
export const PREMIUM_SPACE_MODE_SHARED = "shared";

export const PREMIUM_PROFILE_LIMIT = 4;
export const DEFAULT_PREMIUM_PROFILE_PIN = "0000";
export const PREMIUM_PROFILE_AVATAR = "/pngegg.png";
export const LEGACY_PROFILE_AVATAR = "/profile-default-character.svg";
export const PREMIUM_PROFILE_PRESETS = [
  { color: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)", avatar: PREMIUM_PROFILE_AVATAR },
  { color: "linear-gradient(135deg, #0f766e 0%, #164e63 100%)", avatar: PREMIUM_PROFILE_AVATAR },
  { color: "linear-gradient(135deg, #16a34a 0%, #166534 100%)", avatar: PREMIUM_PROFILE_AVATAR },
  { color: "linear-gradient(135deg, #ca8a04 0%, #a16207 100%)", avatar: PREMIUM_PROFILE_AVATAR },
];

export const SHARED_ARTIFACT_META_KEY = "__premium_shared_meta_v1";
export const SHARED_ARTIFACT_WRAP_KEY = "__highlights_payload_v1";

export const normalizeQuizPayload = (payload) => {
  const multipleChoice = Array.isArray(payload?.multipleChoice) ? payload.multipleChoice : [];
  const rawShort = payload?.shortAnswer;
  const shortAnswer = Array.isArray(rawShort) ? rawShort : rawShort ? [rawShort] : [];
  return { multipleChoice, shortAnswer };
};

export const getTierLabel = (tier) => {
  if (tier === "free") return "Free";
  if (tier === "pro") return "Pro";
  if (tier === "premium") return "Premium";
  return "Free";
};

export const formatSizeMB = (bytes) =>
  `${Math.max(1, Math.round((Number(bytes) || 0) / MB))}MB`;

export const decodePremiumScopeValue = (value) => {
  const raw = String(value ?? "");
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREMIUM_SCOPE_PREFIX)) {
    return { ownerProfileId: null, value: raw };
  }
  const suffixIndex = trimmed.indexOf(PREMIUM_SCOPE_SUFFIX, PREMIUM_SCOPE_PREFIX.length);
  if (suffixIndex < 0) {
    return { ownerProfileId: null, value: raw };
  }
  const ownerProfileId = trimmed.slice(PREMIUM_SCOPE_PREFIX.length, suffixIndex).trim() || null;
  const decoded = trimmed.slice(suffixIndex + PREMIUM_SCOPE_SUFFIX.length) || raw;
  return { ownerProfileId, value: decoded };
};

export const encodePremiumScopeValue = (value, ownerProfileId) => {
  const raw = String(value ?? "");
  if (!ownerProfileId) return raw;
  const decoded = decodePremiumScopeValue(raw).value;
  return `${PREMIUM_SCOPE_PREFIX}${ownerProfileId}${PREMIUM_SCOPE_SUFFIX}${decoded}`;
};

export const createPremiumProfileId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const sanitizePremiumProfileName = (name, fallback = "Member") => {
  const trimmed = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  return (trimmed || fallback).slice(0, 16);
};

export const isValidPremiumAvatar = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("/") ||
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\//i.test(trimmed)
  );
};

export const sanitizePremiumAvatar = (value, fallback) => {
  if (!isValidPremiumAvatar(value)) return fallback;
  const trimmed = value.trim();
  if (trimmed === LEGACY_PROFILE_AVATAR) return PREMIUM_PROFILE_AVATAR;
  return trimmed;
};

export const sanitizePremiumProfilePin = (value) => {
  const trimmed = String(value ?? "").trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : DEFAULT_PREMIUM_PROFILE_PIN;
};

export const normalizePremiumProfilePinInput = (value) => {
  const trimmed = String(value ?? "").trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
};

export const normalizePremiumProfiles = (profiles) => {
  const list = Array.isArray(profiles) ? profiles : [];
  return list.slice(0, PREMIUM_PROFILE_LIMIT).map((profile, index) => {
    const preset = PREMIUM_PROFILE_PRESETS[index % PREMIUM_PROFILE_PRESETS.length];
    const id =
      typeof profile?.id === "string" && profile.id.trim()
        ? profile.id.trim()
        : createPremiumProfileId();
    return {
      id,
      name: sanitizePremiumProfileName(profile?.name, `Member ${index + 1}`),
      color:
        typeof profile?.color === "string" && profile.color.trim()
          ? profile.color
          : preset.color,
      avatar: sanitizePremiumAvatar(profile?.avatar, preset.avatar),
      pin: sanitizePremiumProfilePin(profile?.pin),
    };
  });
};

export const getPremiumProfilesStorageKey = (userId) =>
  `zeusian:premium-profiles:${userId}`;
export const getPremiumActiveProfileStorageKey = (userId) =>
  `zeusian:premium-active-profile:${userId}`;
export const getPremiumSpaceModeStorageKey = (userId) =>
  `zeusian:premium-space-mode:${userId}`;

export const toSortedUniquePages = (pages) =>
  [
    ...new Set(
      (Array.isArray(pages) ? pages : [])
        .map((page) => Number.parseInt(page, 10))
        .filter((page) => page > 0)
    ),
  ].sort((a, b) => a - b);

export const areNumberArraysEqual = (left, right) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

export const toNonNegativeInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const normalizeSharedMemberProgressMap = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.entries(input).reduce((acc, [profileId, rawEntry]) => {
    const normalizedProfileId = String(profileId || "").trim();
    if (!normalizedProfileId) return acc;
    const totalQuestions = toNonNegativeInt(rawEntry?.totalQuestions);
    const answeredQuestions = Math.min(
      totalQuestions || Number.MAX_SAFE_INTEGER,
      toNonNegativeInt(rawEntry?.answeredQuestions)
    );
    acc[normalizedProfileId] = {
      visitedPages: toSortedUniquePages(rawEntry?.visitedPages),
      pageTotal: toNonNegativeInt(rawEntry?.pageTotal),
      answeredQuestions: Math.max(0, answeredQuestions),
      totalQuestions,
      updatedAt:
        typeof rawEntry?.updatedAt === "string" && rawEntry.updatedAt.trim()
          ? rawEntry.updatedAt
          : null,
    };
    return acc;
  }, {});
};

export const normalizeSharedComments = (input) => {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((rawComment) => {
      const message = String(rawComment?.message || "").trim();
      if (!message) return null;
      return {
        id:
          typeof rawComment?.id === "string" && rawComment.id.trim()
            ? rawComment.id.trim()
            : createPremiumProfileId(),
        authorProfileId: String(rawComment?.authorProfileId || "").trim() || null,
        authorName: String(rawComment?.authorName || "Member").trim() || "Member",
        message: message.slice(0, 600),
        createdAt:
          typeof rawComment?.createdAt === "string" && rawComment.createdAt.trim()
            ? rawComment.createdAt
            : new Date().toISOString(),
      };
    })
    .filter(Boolean);
};

export const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeSharedArtifactMeta = (input) => ({
  memberProgressMap: normalizeSharedMemberProgressMap(input?.memberProgressMap),
  comments: normalizeSharedComments(input?.comments),
});

export const hasSharedArtifactMeta = (input) => {
  const sharedMeta = normalizeSharedArtifactMeta(input);
  return (
    Object.keys(sharedMeta.memberProgressMap).length > 0 ||
    sharedMeta.comments.length > 0
  );
};

export const extractSharedMetaFromHighlights = (highlightsValue) => {
  const emptySharedMeta = normalizeSharedArtifactMeta(null);
  if (!isPlainObject(highlightsValue)) {
    return { highlights: highlightsValue ?? null, sharedMeta: emptySharedMeta };
  }

  const sharedRaw = highlightsValue[SHARED_ARTIFACT_META_KEY];
  if (!isPlainObject(sharedRaw)) {
    return { highlights: highlightsValue, sharedMeta: emptySharedMeta };
  }

  const sharedMeta = normalizeSharedArtifactMeta(sharedRaw);
  if (Object.prototype.hasOwnProperty.call(highlightsValue, SHARED_ARTIFACT_WRAP_KEY)) {
    return {
      highlights: highlightsValue[SHARED_ARTIFACT_WRAP_KEY] ?? null,
      sharedMeta,
    };
  }

  const rest = { ...highlightsValue };
  delete rest[SHARED_ARTIFACT_META_KEY];
  return {
    highlights: Object.keys(rest).length > 0 ? rest : null,
    sharedMeta,
  };
};

export const composeHighlightsWithSharedMeta = (
  highlightsValue,
  sharedMetaInput
) => {
  const sharedMeta = normalizeSharedArtifactMeta(sharedMetaInput);
  if (!hasSharedArtifactMeta(sharedMeta)) {
    return highlightsValue ?? null;
  }
  if (isPlainObject(highlightsValue)) {
    return {
      ...highlightsValue,
      [SHARED_ARTIFACT_META_KEY]: sharedMeta,
    };
  }
  return {
    [SHARED_ARTIFACT_META_KEY]: sharedMeta,
    [SHARED_ARTIFACT_WRAP_KEY]: highlightsValue ?? null,
  };
};

export const parsePageSelectionInput = (raw, totalPages) => {
  const cleaned = String(raw || "").replace(/\s+/g, "");
  if (!cleaned) {
    return { pages: [], error: "Enter page numbers (example: 1,3,5-8)." };
  }
  const pages = new Set();
  const parts = cleaned.split(",").filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const range = part.split("-");
      if (range.length !== 2) {
        return { pages: [], error: "Invalid page range format." };
      }
      const start = Number.parseInt(range[0], 10);
      const end = Number.parseInt(range[1], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
        return { pages: [], error: "Invalid page range values." };
      }
      for (let i = start; i <= end; i += 1) {
        pages.add(i);
      }
    } else {
      const page = Number.parseInt(part, 10);
      if (!Number.isFinite(page) || page <= 0) {
        return { pages: [], error: "Invalid page number." };
      }
      pages.add(page);
    }
  }
  const total = Number.isFinite(totalPages) ? totalPages : 0;
  const filtered = [...pages].filter((page) => (total ? page <= total : true)).sort((a, b) => a - b);
  if (filtered.length === 0) {
    return { pages: [], error: "No valid pages remain after filtering by total pages." };
  }
  return { pages: filtered, error: "" };
};

export const parseChapterRangeSelectionInput = (raw, totalPages) => {
  const source = String(raw || "").trim();
  if (!source) {
    return { chapters: [], error: "" };
  }
  const limit = Number.isFinite(totalPages) ? totalPages : 0;
  if (!limit) {
    return { chapters: [], error: "Total page count is unknown. Open a PDF first." };
  }

  const tokens = source
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return { chapters: [], error: "Enter chapter ranges (example: 1:1-12, 2:13-24)." };
  }

  const chapters = [];
  const usedPages = new Set();
  const usedChapterNumbers = new Set();
  let nextAutoNumber = 1;

  for (const token of tokens) {
    const compact = token.replace(/\s+/g, "");
    let chapterNumber = null;
    let pageStart = null;
    let pageEnd = null;

    let matched =
      compact.match(/^(\d+)(?:장)?[:=](\d+)-(\d+)$/i) ||
      compact.match(/^ch(?:apter)?(\d+)[:=](\d+)-(\d+)$/i);
    if (matched) {
      chapterNumber = Number.parseInt(matched[1], 10);
      pageStart = Number.parseInt(matched[2], 10);
      pageEnd = Number.parseInt(matched[3], 10);
    } else {
      matched = compact.match(/^(\d+)-(\d+)$/);
      if (matched) {
        chapterNumber = nextAutoNumber;
        pageStart = Number.parseInt(matched[1], 10);
        pageEnd = Number.parseInt(matched[2], 10);
      } else {
        return {
          chapters: [],
          error: `Invalid chapter format: "${token}" (example: 1:1-12, 2:13-24)`,
        };
      }
    }

    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
      return { chapters: [], error: `Invalid chapter number in token: "${token}"` };
    }
    if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageStart <= 0 || pageEnd <= 0) {
      return { chapters: [], error: `Invalid page range in token: "${token}"` };
    }
    if (pageStart > pageEnd) {
      return { chapters: [], error: `Range start must be <= end: "${token}"` };
    }
    if (pageEnd > limit) {
      return {
        chapters: [],
        error: `Page range exceeds total pages (${limit}p): "${token}"`,
      };
    }
    if (usedChapterNumbers.has(chapterNumber)) {
      return { chapters: [], error: `Duplicate chapter number: ${chapterNumber}` };
    }

    for (let page = pageStart; page <= pageEnd; page += 1) {
      if (usedPages.has(page)) {
        return { chapters: [], error: `Overlapping page detected: ${page}p` };
      }
      usedPages.add(page);
    }

    chapters.push({
      id: `chapter-${chapterNumber}`,
      chapterNumber,
      chapterTitle: `Chapter ${chapterNumber} (${pageStart}-${pageEnd}p)`,
      pageStart,
      pageEnd,
    });
    usedChapterNumbers.add(chapterNumber);
    nextAutoNumber = Math.max(nextAutoNumber, chapterNumber + 1);
  }

  chapters.sort((left, right) => left.chapterNumber - right.chapterNumber);
  return { chapters, error: "" };
};

export const pickRandomItems = (items, count) => {
  if (!Array.isArray(items) || count <= 0) return [];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
};

export const formatMockExamTitle = (exam, index) => {
  if (!exam) return "mock exam";
  const rawTitle = String(exam.title || "").trim();
  if (/^\d{4}\.\d{1,2}\.\d{1,2}\s+\d+/.test(rawTitle)) {
    return rawTitle;
  }
  const date = exam.created_at ? new Date(exam.created_at) : new Date();
  const dateStamp = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  const sequence = Math.max(1, (index ?? 0) + 1);
  return `${dateStamp} ${sequence} mock exam`;
};

export const chunkMockExamPages = (orderedItems) => {
  const list = Array.isArray(orderedItems) ? orderedItems : [];
  if (!list.length) return [];
  return [list.slice(0, 4), list.slice(4, 8), list.slice(8, 10)];
};
