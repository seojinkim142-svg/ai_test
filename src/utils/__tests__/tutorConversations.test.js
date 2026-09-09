import {
  buildTutorConversationTitle,
  readTutorConversationsFromHighlights,
  upsertTutorConversation,
  writeTutorConversationsToHighlights,
  TUTOR_CONVERSATION_MAX_SESSIONS,
} from "../studyArtifacts";

const msg = (role, content) => ({ id: `${role}-${content}`, role, content });

describe("AI 튜터 대화 세션 저장/불러오기", () => {
  test("세션을 저장하고 다시 읽어올 수 있다", () => {
    const sessions = upsertTutorConversation([], {
      id: "s1",
      messages: [msg("user", "극한이 뭐야?"), msg("assistant", "극한은...")],
    });
    const highlights = writeTutorConversationsToHighlights(null, sessions);
    const restored = readTutorConversationsFromHighlights(highlights);

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe("s1");
    expect(restored[0].messages).toHaveLength(2);
    expect(restored[0].title).toBe("극한이 뭐야?");
  });

  test("기존 highlights 의 다른 데이터를 지우지 않는다", () => {
    const existing = { __concept_tags_v1: ["미적분"] };
    const sessions = upsertTutorConversation([], {
      id: "s1",
      messages: [msg("user", "질문")],
    });
    const highlights = writeTutorConversationsToHighlights(existing, sessions);

    expect(highlights.__concept_tags_v1).toEqual(["미적분"]);
    expect(readTutorConversationsFromHighlights(highlights)).toHaveLength(1);
  });

  test("같은 id 로 다시 저장하면 덮어쓰고 최신순으로 앞에 온다", () => {
    let sessions = upsertTutorConversation([], { id: "old", messages: [msg("user", "옛날 질문")] });
    sessions = upsertTutorConversation(sessions, { id: "new", messages: [msg("user", "새 질문")] });
    sessions = upsertTutorConversation(sessions, {
      id: "old",
      messages: [msg("user", "옛날 질문"), msg("assistant", "답변 추가")],
    });

    expect(sessions[0].id).toBe("old");
    expect(sessions[0].messages).toHaveLength(2);
    expect(sessions).toHaveLength(2);
  });

  test("메시지가 비면 세션이 목록에서 제거된다 (대화 초기화)", () => {
    let sessions = upsertTutorConversation([], { id: "s1", messages: [msg("user", "질문")] });
    expect(sessions).toHaveLength(1);
    sessions = upsertTutorConversation(sessions, { id: "s1", messages: [] });
    expect(sessions).toHaveLength(0);
  });

  test("세션 개수 상한을 넘지 않는다", () => {
    let sessions = [];
    for (let i = 0; i < TUTOR_CONVERSATION_MAX_SESSIONS + 5; i += 1) {
      sessions = upsertTutorConversation(sessions, {
        id: `s${i}`,
        messages: [msg("user", `질문 ${i}`)],
      });
    }
    expect(sessions).toHaveLength(TUTOR_CONVERSATION_MAX_SESSIONS);
    // 가장 최근 것이 남아있어야 한다
    expect(sessions[0].id).toBe(`s${TUTOR_CONVERSATION_MAX_SESSIONS + 4}`);
  });

  test("제목은 첫 사용자 질문에서 만들어진다", () => {
    expect(buildTutorConversationTitle([msg("assistant", "안녕"), msg("user", "미분 설명해줘")])).toBe(
      "미분 설명해줘"
    );
    expect(buildTutorConversationTitle([])).toBe("새 대화");
    const long = "가".repeat(80);
    expect(buildTutorConversationTitle([msg("user", long)]).length).toBeLessThanOrEqual(43);
  });

  test("깨진 입력에서 죽지 않는다", () => {
    expect(readTutorConversationsFromHighlights(null)).toEqual([]);
    expect(readTutorConversationsFromHighlights({ __tutor_conversations_v1: "nope" })).toEqual([]);
    expect(upsertTutorConversation(null, {})).toEqual([]);
    expect(writeTutorConversationsToHighlights(null, null)).toBeNull();
  });
});
