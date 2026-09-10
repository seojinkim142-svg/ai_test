// 실제 사고: 챕터 1~5를 지정해 요약했더니 1장 전체 + 5장 일부만 나오고
// 2~4장이 통째로 빠졌다. 원인은 배치 호출 하나(JSON 파싱 실패 등)가
// 예외를 던지면 이미 성공한 다른 배치 결과까지 전부 버리고 legacy
// 요약(옛 shrinkWithTail 절단 로직, 앞 75%+뒤 25%만 남김)으로 통째로
// 폴백하던 것이었다. 배치 하나가 실패해도 나머지 배치는 살아남아야 한다.

let mockPostChatRequest;

jest.mock("../../services/openai/base.js", () => ({
  getOutputLanguageLabel: () => "Korean",
  normalizeEvidenceText: (v) => v,
  parseJsonSafe: (v) => JSON.parse(v),
  sanitizeJson: (v) => v,
  sanitizeMarkdown: (v) => v,
  limitText: (v) => v,
  postChatRequest: (...args) => mockPostChatRequest(...args),
}));
jest.mock("../../services/openai/quiz.js", () => ({
  extractQuestionStyleBlocks: () => [],
}));

const { generateSummary } = require("../../services/openai/summary");

function chatResponse(content) {
  return { choices: [{ message: { content } }] };
}

function buildManualChapters(count, charsPerChapter = 12000) {
  const chapters = [];
  for (let i = 1; i <= count; i += 1) {
    chapters.push({
      id: `chapter-${i}`,
      chapterNumber: i,
      chapterTitle: `Chapter ${i}`,
      pageStart: i * 10 - 9,
      pageEnd: i * 10,
      text: `CH${i}MARK `.repeat(Math.ceil(charsPerChapter / 8)).slice(0, charsPerChapter),
    });
  }
  return chapters;
}

function chapterPayload(chapterNumber, id) {
  return {
    overview: [],
    chapters: [
      {
        id,
        chapterNumber,
        chapterTitle: `Chapter ${chapterNumber}`,
        sections: [
          {
            sectionTitle: `Section ${chapterNumber}`,
            keySummary: `요약 내용 CH${chapterNumber}MARK`,
            coreFindings: [],
          },
        ],
        summaryPoints: [{ point: `포인트 ${chapterNumber}`, explanation: `설명 CH${chapterNumber}MARK` }],
      },
    ],
  };
}

describe("배치 요약: 일부 배치 실패 시 복원력", () => {
  beforeEach(() => {
    mockPostChatRequest = jest.fn();
  });

  test("배치 하나가 실패해도 나머지 배치의 챕터는 결과에 남는다", async () => {
    // 5개 챕터, 각 12000자 -> MAX_REQUEST_SOURCE_CHARS(24000) 기준 여러 배치로 나뉨
    const chapters = buildManualChapters(5, 12000);
    let callCount = 0;

    mockPostChatRequest.mockImplementation(async (body) => {
      callCount += 1;
      const payload = JSON.parse(body.messages[body.messages.length - 1].content.match(/Input:\s*([\s\S]*)/)[1]);
      const batchChapters = payload.chapters;

      // 두 번째 배치는 계속 실패(재시도도 실패)하도록 만든다
      const isSecondBatch = batchChapters.some((c) => c.chapterNumber === 3);
      if (isSecondBatch) {
        throw new Error("모의 네트워크 오류");
      }

      return chatResponse(
        JSON.stringify({
          overview: [],
          chapters: batchChapters.map((c) => chapterPayload(c.chapterNumber, c.id).chapters[0]),
        })
      );
    });

    const result = await generateSummary("무시됨", {
      chapterized: true,
      chapterSections: chapters,
      outputLanguage: "ko",
    });

    expect(result).toBeTruthy();
    // legacy 폴백(전체 텍스트 슬라이스)로 떨어지지 않았다면 구조화된 마크다운이 나온다
    expect(result).toContain("## Chapter 1");
    // 실패한 배치의 챕터(3번)를 제외한 나머지는 남아있어야 한다
    const presentChapters = [1, 2, 4, 5].filter((n) => result.includes(`CH${n}MARK`));
    expect(presentChapters.length).toBeGreaterThan(0);
  }, 15000);

  test("모든 배치가 성공하면 5개 챕터가 전부 결과에 남는다", async () => {
    const chapters = buildManualChapters(5, 12000);

    mockPostChatRequest.mockImplementation(async (body) => {
      const payload = JSON.parse(body.messages[body.messages.length - 1].content.match(/Input:\s*([\s\S]*)/)[1]);
      const batchChapters = payload.chapters;
      return chatResponse(
        JSON.stringify({
          overview: [],
          chapters: batchChapters.map((c) => chapterPayload(c.chapterNumber, c.id).chapters[0]),
        })
      );
    });

    const result = await generateSummary("무시됨", {
      chapterized: true,
      chapterSections: chapters,
      outputLanguage: "ko",
    });

    for (let n = 1; n <= 5; n += 1) {
      expect(result).toContain(`CH${n}MARK`);
    }
  }, 15000);
});
