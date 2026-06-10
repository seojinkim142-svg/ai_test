// 단순화된 SM-2 기반 간격 반복(spaced repetition) 알고리즘
// 카드별 정답("알고있음")/오답("모름") 두 가지 결과만 받아 다음 복습 시점을 계산한다

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const RETRY_AFTER_MS = 10 * 60 * 1000; // 오답 카드는 10분 뒤 재시도
const DAY_MS = 24 * 60 * 60 * 1000;

export function isCardDue(card, now = Date.now()) {
  if (!card?.srs_due_at) return true;
  const dueAt = new Date(card.srs_due_at).getTime();
  if (Number.isNaN(dueAt)) return true;
  return dueAt <= now;
}

export function computeNextSrsState(card, result, now = new Date()) {
  const ease = Number(card?.srs_ease_factor) || DEFAULT_EASE_FACTOR;
  const repetitions = Number(card?.srs_repetitions) || 0;
  const prevInterval = Number(card?.srs_interval_days) || 0;

  if (result === "unknown") {
    return {
      srs_due_at: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
      srs_interval_days: 0,
      srs_ease_factor: Math.max(MIN_EASE_FACTOR, ease - 0.2),
      srs_repetitions: 0,
      srs_last_reviewed_at: now.toISOString(),
    };
  }

  let nextInterval;
  if (repetitions === 0) nextInterval = 1;
  else if (repetitions === 1) nextInterval = 3;
  else nextInterval = Math.round(prevInterval * ease);

  return {
    srs_due_at: new Date(now.getTime() + nextInterval * DAY_MS).toISOString(),
    srs_interval_days: nextInterval,
    srs_ease_factor: ease,
    srs_repetitions: repetitions + 1,
    srs_last_reviewed_at: now.toISOString(),
  };
}
