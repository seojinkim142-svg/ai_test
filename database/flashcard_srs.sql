-- flashcards 테이블에 간격 반복(spaced repetition) 학습 상태 컬럼 추가
-- SM-2 기반 단순화 알고리즘: srs_repetitions, srs_ease_factor, srs_interval_days로 다음 srs_due_at 계산

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS srs_due_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS srs_interval_days REAL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS srs_ease_factor REAL DEFAULT 2.5;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS srs_repetitions INTEGER DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS srs_last_reviewed_at TIMESTAMPTZ DEFAULT NULL;

-- 오늘 복습할 카드 조회용 인덱스
CREATE INDEX IF NOT EXISTS flashcards_srs_due_idx ON flashcards(user_id, deck_id, srs_due_at);
