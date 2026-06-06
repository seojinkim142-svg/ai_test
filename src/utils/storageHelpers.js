export function buildStoragePathCandidates(rawPath) {
  const source = String(rawPath || "").trim();
  if (!source) return [];

  const seen = new Set();
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(source);

  if (/%[0-9A-Fa-f]{2}/.test(source)) {
    try {
      addCandidate(decodeURIComponent(source));
    } catch {
      // Ignore malformed escape sequences.
    }
  }

  try {
    const decoded = decodeURI(source);
    addCandidate(decoded);
    addCandidate(encodeURI(decoded));
  } catch {
    // Ignore malformed URI sequences.
  }

  addCandidate(encodeURI(source));
  return candidates;
}

export function isSafeStoragePathForReuse(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return false;
  if (value.includes("%")) return false;
  return /^[\x20-\x7E]+$/.test(value);
}
