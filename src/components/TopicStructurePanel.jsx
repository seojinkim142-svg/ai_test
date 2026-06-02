import { useState } from "react";
import MathMarkdown from "./MathMarkdown";

export default function TopicStructurePanel({
  topicStructure,
  isLoading,
  error,
  onRequestGenerate,
  onExplainConcept,
  onStartQuiz,
  onStartVocabExam,
  isVocabularyMode = false,
}) {
  const [expandedId, setExpandedId] = useState(null);
  // { key: "topicId::concept", text: "", loading: false, error: "" }
  const [conceptExpl, setConceptExpl] = useState({ key: null, text: "", loading: false, error: "" });

  function toggleTopic(id) {
    setExpandedId((prev) => (prev === id ? null : id));
    setConceptExpl({ key: null, text: "", loading: false, error: "" });
  }

  async function handleConceptClick(concept, topic) {
    const key = `${topic.id}::${concept}`;
    if (conceptExpl.key === key) {
      setConceptExpl({ key: null, text: "", loading: false, error: "" });
      return;
    }
    setConceptExpl({ key, text: "", loading: true, error: "" });
    try {
      const text = await onExplainConcept(concept, topic.title);
      setConceptExpl({ key, text, loading: false, error: "" });
    } catch (err) {
      setConceptExpl({ key, text: "", loading: false, error: err.message || "설명을 불러오지 못했습니다." });
    }
  }

  function renderStars(importance) {
    const filled = Math.max(0, Math.min(5, importance));
    return (
      <span className="tracking-tight">
        <span className="text-yellow-400">{"★".repeat(filled)}</span>
        <span className="text-slate-600">{"☆".repeat(5 - filled)}</span>
      </span>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
          <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>학습 구조 분석 중...</span>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/5 h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={onRequestGenerate}
          className="self-start rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!topicStructure) {
    return (
      <div className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="text-4xl">🗂️</div>
        <p className="text-slate-400 text-sm leading-relaxed">
          AI가 문서의 학습 구조를 분석합니다.<br />
          주요 주제, 핵심 개념, 예상 문제 수를 파악합니다.
        </p>
        <button
          onClick={onRequestGenerate}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 transition-colors"
        >
          학습 구조 분석 시작
        </button>
      </div>
    );
  }

  const { rootTopic, topics } = topicStructure;

  return (
    <div className="flex flex-col gap-1 p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-emerald-400 font-medium mb-0.5">학습 구조</p>
          <h2 className="text-base font-bold text-white">{rootTopic}</h2>
        </div>
        <button
          onClick={onRequestGenerate}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/5 mt-0.5"
        >
          재분석
        </button>
      </div>

      {/* 주제 목록 */}
      <div className="flex flex-col gap-1.5">
        {topics.map((topic) => {
          const isExpanded = expandedId === topic.id;
          return (
            <div key={topic.id}>
              {/* 카드 (헤더 + 펼침 영역 하나의 박스) */}
              <div
                className={`rounded-2xl border transition-all ${
                  isExpanded
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-white/8 bg-white/5"
                }`}
              >
                {/* 주제 행 (클릭 가능 헤더) */}
                <button
                  onClick={() => toggleTopic(topic.id)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 rounded-2xl transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${isExpanded ? "text-emerald-300" : "text-slate-200"}`}>
                      {topic.title}
                    </span>
                    <svg
                      className={`w-4 h-4 flex-shrink-0 transition-transform ${
                        isExpanded ? "rotate-180 text-emerald-400" : "text-slate-500"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {!isExpanded && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      {renderStars(topic.importance)}
                      <span>개념 {topic.conceptCount}개</span>
                      <span>예상 {topic.expectedQuestions}문제</span>
                    </div>
                  )}
                </button>

                {/* 펼침 내용 (같은 카드 안에) */}
                {isExpanded && (
                  <div className="px-4 pb-4 flex flex-col gap-3">
                    {/* 구분선 */}
                    <div className="h-px bg-emerald-500/20" />

                    {/* 통계 3개 */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <p className="text-xl font-bold text-white">{topic.conceptCount}</p>
                        <p className="text-[11px] text-slate-400">핵심 개념</p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <p className="text-base leading-tight">{renderStars(topic.importance)}</p>
                        <p className="text-[11px] text-slate-400">중요도</p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <p className="text-xl font-bold text-white">{topic.expectedQuestions}</p>
                        <p className="text-[11px] text-slate-400">예상 문제</p>
                      </div>
                    </div>

                    {/* 핵심 개념 태그 — 클릭 시 설명 */}
                    {topic.keyConcepts.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-[11px] text-slate-500">개념 탭을 눌러 설명을 확인하세요</p>
                        <div className="flex flex-wrap gap-1.5">
                          {topic.keyConcepts.map((concept) => {
                            const key = `${topic.id}::${concept}`;
                            const isActive = conceptExpl.key === key;
                            return (
                              <button
                                key={concept}
                                onClick={() => handleConceptClick(concept, topic)}
                                className={`text-xs rounded-full px-2.5 py-0.5 border transition-colors ${
                                  isActive
                                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/50"
                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/25"
                                }`}
                              >
                                {concept}
                              </button>
                            );
                          })}
                        </div>

                        {/* 인라인 설명 박스 */}
                        {conceptExpl.key?.startsWith(topic.id) && (
                          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-3">
                            {conceptExpl.loading ? (
                              <div className="flex items-center gap-2 text-slate-400 text-xs">
                                <svg className="animate-spin h-3.5 w-3.5 text-emerald-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span>개념 설명 불러오는 중...</span>
                              </div>
                            ) : conceptExpl.error ? (
                              <p className="text-red-400 text-xs">{conceptExpl.error}</p>
                            ) : (
                              <MathMarkdown
                                content={conceptExpl.text}
                                className="summary-prose max-w-none text-xs text-slate-200 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 버튼 영역 */}
                    <div className="flex flex-col gap-2">
                      {isVocabularyMode && onStartVocabExam && (
                        <button
                          onClick={() => onStartVocabExam(topic)}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
                        >
                          이 주제 단어 시험
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
