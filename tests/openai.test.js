/**
 * openai 서비스 순수 함수 테스트
 *
 * 테스트 대상:
 *   1. normalizeAdditionalRequest  — 텍스트 정규화
 *   2. toSortedUniquePages         — 페이지 번호 정렬/중복제거
 *   3. buildAvoidReuseBlock        — avoid 블록 생성
 *   4. getCacheKey                 — 동일 입력 → 동일 키
 *
 * 이 파일은 브라우저 전용 모듈(import.meta.env, Capacitor 등)을 직접 임포트하지 않고
 * 순수 함수만을 인라인으로 재현해서 테스트합니다.
 * (실제 모듈이 Vite 환경에서만 빌드되기 때문)
 */

// ─── 테스트 대상 함수를 인라인으로 복사 (side-effect 없는 순수 함수) ──────────

function normalizeAdditionalRequest(value, maxLength = 500) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
}

function toSortedUniquePages(pages) {
  return [
    ...new Set(
      (Array.isArray(pages) ? pages : [])
        .map((page) => Number.parseInt(page, 10))
        .filter((page) => Number.isFinite(page) && page > 0)
    ),
  ].sort((a, b) => a - b);
}

function buildAvoidReuseBlock(
  items,
  { title = "Do not reuse these prompts", maxItems = 40, maxLength = 120 } = {}
) {
  const normalized = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const raw = String(item || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(raw.slice(0, maxLength));
  });
  if (!normalized.length) return "";
  const lines = normalized.slice(0, maxItems).map((item, index) => `${index + 1}. ${item}`);
  return `[${title}]\n${lines.join("\n")}`;
}

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(36);
}

function getCacheKey(text, options) {
  const raw = text + JSON.stringify(options);
  return `ai_cache_v1_${djb2Hash(raw)}`;
}

// ─── 1. normalizeAdditionalRequest ────────────────────────────────────────────

describe("normalizeAdditionalRequest", () => {
  test("빈 값은 빈 문자열 반환", () => {
    expect(normalizeAdditionalRequest("")).toBe("");
    expect(normalizeAdditionalRequest(null)).toBe("");
    expect(normalizeAdditionalRequest(undefined)).toBe("");
  });

  test("줄 앞뒤 공백 제거 및 빈 줄 필터", () => {
    const input = "  첫 줄  \n\n  두 번째 줄  \n   ";
    const result = normalizeAdditionalRequest(input);
    expect(result).toBe("첫 줄\n두 번째 줄");
  });

  test("\\r\\n을 \\n으로 정규화", () => {
    const input = "line1\r\nline2\r\nline3";
    const result = normalizeAdditionalRequest(input);
    expect(result).toBe("line1\nline2\nline3");
  });

  test("maxLength 초과 시 자름", () => {
    const longText = "a".repeat(600);
    const result = normalizeAdditionalRequest(longText, 500);
    expect(result.length).toBe(500);
  });

  test("단일 줄 텍스트 그대로 반환", () => {
    expect(normalizeAdditionalRequest("퀴즈 난이도를 높여주세요")).toBe("퀴즈 난이도를 높여주세요");
  });
});

// ─── 2. toSortedUniquePages ───────────────────────────────────────────────────

describe("toSortedUniquePages", () => {
  test("정수 배열을 정렬된 고유값으로 반환", () => {
    expect(toSortedUniquePages([3, 1, 2, 1, 3])).toEqual([1, 2, 3]);
  });

  test("0과 음수는 제외", () => {
    expect(toSortedUniquePages([0, -1, 5, 3])).toEqual([3, 5]);
  });

  test("빈 배열은 빈 배열 반환", () => {
    expect(toSortedUniquePages([])).toEqual([]);
    expect(toSortedUniquePages(null)).toEqual([]);
    expect(toSortedUniquePages(undefined)).toEqual([]);
  });

  test("문자열 숫자도 파싱", () => {
    expect(toSortedUniquePages(["12", "5", "12"])).toEqual([5, 12]);
  });

  test("NaN/Infinity 제외", () => {
    expect(toSortedUniquePages([Infinity, NaN, 7, 2])).toEqual([2, 7]);
  });
});

// ─── 3. buildAvoidReuseBlock ──────────────────────────────────────────────────

describe("buildAvoidReuseBlock", () => {
  test("빈 배열이면 빈 문자열 반환", () => {
    expect(buildAvoidReuseBlock([])).toBe("");
    expect(buildAvoidReuseBlock(null)).toBe("");
  });

  test("항목을 번호 목록으로 출력", () => {
    const result = buildAvoidReuseBlock(["질문1", "질문2"]);
    expect(result).toContain("1. 질문1");
    expect(result).toContain("2. 질문2");
  });

  test("중복 항목 제거 (대소문자 무시)", () => {
    const result = buildAvoidReuseBlock(["Hello", "hello", "HELLO"]);
    expect(result).toContain("1. Hello");
    // 중복이므로 2번 항목 없음
    expect(result).not.toContain("2.");
  });

  test("커스텀 title 반영", () => {
    const result = buildAvoidReuseBlock(["항목"], { title: "금지 목록" });
    expect(result).toContain("[금지 목록]");
  });

  test("maxItems 초과 항목 잘림", () => {
    const items = Array.from({ length: 10 }, (_, i) => `item${i}`);
    const result = buildAvoidReuseBlock(items, { maxItems: 3 });
    expect(result).toContain("1. item0");
    expect(result).toContain("3. item2");
    expect(result).not.toContain("4. item3");
  });

  test("maxLength 초과 항목 자름", () => {
    const longItem = "a".repeat(200);
    const result = buildAvoidReuseBlock([longItem], { maxLength: 50 });
    expect(result).toContain("1. " + "a".repeat(50));
    expect(result).not.toContain("a".repeat(51));
  });
});

// ─── 4. getCacheKey (캐시 키 생성 로직) ───────────────────────────────────────

describe("getCacheKey", () => {
  test("동일 입력은 동일 키 반환", () => {
    const key1 = getCacheKey("텍스트", { type: "quiz", version: "v1" });
    const key2 = getCacheKey("텍스트", { type: "quiz", version: "v1" });
    expect(key1).toBe(key2);
  });

  test("다른 텍스트는 다른 키", () => {
    const key1 = getCacheKey("텍스트A", { type: "quiz" });
    const key2 = getCacheKey("텍스트B", { type: "quiz" });
    expect(key1).not.toBe(key2);
  });

  test("다른 옵션은 다른 키", () => {
    const key1 = getCacheKey("동일텍스트", { type: "quiz" });
    const key2 = getCacheKey("동일텍스트", { type: "summary" });
    expect(key1).not.toBe(key2);
  });

  test("키는 항상 ai_cache_v1_ 접두사로 시작", () => {
    const key = getCacheKey("any text", {});
    expect(key.startsWith("ai_cache_v1_")).toBe(true);
  });

  test("빈 텍스트와 빈 옵션도 일관된 키 생성", () => {
    const key1 = getCacheKey("", {});
    const key2 = getCacheKey("", {});
    expect(key1).toBe(key2);
    expect(key1.startsWith("ai_cache_v1_")).toBe(true);
  });
});
