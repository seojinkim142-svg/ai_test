// 진단 테스트 채점 / 예상 점수 환산 유틸

export const DIAGNOSTIC_DIFFICULTY_WEIGHTS = { 하: 20, 중: 25, 상: 30 };
// 4문항(하/중/중/상) 기준 가중치 합 = 100

export function computeDiagnosticResult(items, answers) {
  const list = Array.isArray(items) ? items : [];
  const weights = list.map((item) => DIAGNOSTIC_DIFFICULTY_WEIGHTS[item?.difficulty] || 25);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  let correctWeight = 0;
  let correctCount = 0;
  const topicBreakdown = list.map((item, index) => {
    const isCorrect = Number(answers?.[index]) === Number(item?.answerIndex);
    if (isCorrect) {
      correctWeight += weights[index];
      correctCount += 1;
    }
    return {
      topic: String(item?.topic || "").trim() || `문항 ${index + 1}`,
      difficulty: item?.difficulty || "중",
      correct: isCorrect,
    };
  });

  const predictedScore = Math.round((correctWeight / totalWeight) * 100);

  return {
    totalQuestions: list.length,
    correctCount,
    predictedScore,
    topicBreakdown,
    feedback: getDiagnosticFeedback(predictedScore),
  };
}

// Supabase 행(snake_case)을 computeDiagnosticResult와 동일한 모양으로 변환
export function normalizeDiagnosticResultRow(row) {
  if (!row) return null;
  const predictedScore = Number(row.predicted_score) || 0;
  return {
    totalQuestions: Number(row.total_questions) || 0,
    correctCount: Number(row.correct_count) || 0,
    predictedScore,
    topicBreakdown: Array.isArray(row.topic_breakdown) ? row.topic_breakdown : [],
    feedback: getDiagnosticFeedback(predictedScore),
  };
}

export function getDiagnosticFeedback(predictedScore) {
  if (predictedScore >= 90) {
    return { tier: "최상위권", message: "이 자료를 거의 완벽히 이해하고 있어요. 마무리 점검만 하면 충분해요." };
  }
  if (predictedScore >= 70) {
    return { tier: "상위권", message: "핵심 개념은 탄탄해요. 응용 문제 위주로 더 다지면 좋아요." };
  }
  if (predictedScore >= 50) {
    return { tier: "평균", message: "기본 개념은 잡혀 있어요. 약한 부분을 위주로 복습해보세요." };
  }
  return { tier: "기초 다지기 필요", message: "처음부터 차근차근 핵심 개념을 학습하는 걸 추천해요." };
}
