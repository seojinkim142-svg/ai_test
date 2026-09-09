// summary.js 는 네트워크/플랫폼 계층까지 끌고 오므로, 순수 텍스트 분할 로직만
// 검증하기 위해 API 호출 계층은 모킹한다.
jest.mock("../../services/openai/base.js", () => ({
  getOutputLanguageLabel: () => "Korean",
  normalizeEvidenceText: (v) => v,
  parseJsonSafe: (v) => JSON.parse(v),
  sanitizeJson: (v) => v,
  sanitizeMarkdown: (v) => v,
  limitText: (v) => v,
  postChatRequest: jest.fn(),
}));
jest.mock("../../services/openai/quiz.js", () => ({
  extractQuestionStyleBlocks: () => [],
}));
import {
  buildChapterSummaryInput,
  splitTextIntoParts,
} from "../../services/openai/summary";

// 80페이지 문서를 요약했더니 p22까지만 나오고 중간이 통째로 빠진 사고가 있었다.
// 원인은 입력을 앞부분+꼬리만 남기고 중간을 버리는 절단이었다.
// 문서 전체가 모델 입력에 담기는지를 여기서 고정한다.
describe("요약 입력 커버리지", () => {
  // 페이지마다 고유 표식을 남겨 어느 페이지가 누락됐는지 추적한다
  const buildFakeDocument = (pageCount, charsPerPage = 1500) => {
    const pages = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const marker = `[p.${page}]`;
      const body = `PAGE${page}MARK `.repeat(Math.ceil(charsPerPage / 12)).slice(0, charsPerPage);
      pages.push(`${marker} ${body}`);
    }
    return pages.join("\n\n");
  };

  const collectCoveredPages = (chapters) => {
    const joined = chapters.map((chapter) => chapter.text).join(" ");
    const covered = new Set();
    for (const match of joined.matchAll(/PAGE(\d+)MARK/g)) {
      covered.add(Number(match[1]));
    }
    return covered;
  };

  test("80페이지 문서의 모든 페이지가 입력에 포함된다", () => {
    const pageCount = 80;
    const doc = buildFakeDocument(pageCount);
    const input = buildChapterSummaryInput(doc, { scope: "Full document" });
    const covered = collectCoveredPages(input.chapters);

    const missing = [];
    for (let page = 1; page <= pageCount; page += 1) {
      if (!covered.has(page)) missing.push(page);
    }
    expect(missing).toEqual([]);
  });

  test("문서 중간 구간이 통째로 사라지지 않는다", () => {
    const doc = buildFakeDocument(80);
    const input = buildChapterSummaryInput(doc, { scope: "Full document" });
    const covered = collectCoveredPages(input.chapters);

    // 사고 당시 빠졌던 구간(p23~p77)을 콕 집어 확인
    for (let page = 23; page <= 77; page += 1) {
      expect(covered.has(page)).toBe(true);
    }
  });

  test("잘라내기 표식(...)이 입력에 남지 않는다", () => {
    const doc = buildFakeDocument(80);
    const input = buildChapterSummaryInput(doc, { scope: "Full document" });
    for (const chapter of input.chapters) {
      expect(chapter.text).not.toContain(" ... ");
    }
  });

  test("긴 구간은 버려지지 않고 파트로 쪼개진다", () => {
    const text = "가나다라마바사아자차카타파하 ".repeat(2000); // 약 3만자
    const parts = splitTextIntoParts(text, 9000);

    expect(parts.length).toBeGreaterThan(1);
    // 쪼갠 조각을 합치면 원본 분량이 거의 그대로 남아야 한다
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    expect(totalLength).toBeGreaterThan(text.trim().length * 0.95);
  });

  test("짧은 문서는 쪼개지 않고 그대로 쓴다", () => {
    const text = "짧은 문서입니다.";
    expect(splitTextIntoParts(text, 9000)).toEqual([text]);
  });

  test("빈 입력에서 죽지 않는다", () => {
    expect(splitTextIntoParts("", 9000)).toEqual([]);
    expect(buildChapterSummaryInput("", {}).chapters).toEqual([]);
  });
});
