-- flashcard_scores: 플래시카드 시험 점수 히스토리 테이블
-- 기존 localStorage 기반 점수 기록을 Supabase로 이전

CREATE TABLE IF NOT EXISTS flashcard_scores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id     TEXT        NOT NULL,
  total       INTEGER     NOT NULL DEFAULT 0,
  known       INTEGER     NOT NULL DEFAULT 0,
  unknown     INTEGER     NOT NULL DEFAULT 0,
  accuracy    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE flashcard_scores ENABLE ROW LEVEL SECURITY;

-- 사용자는 본인 점수만 접근 가능
CREATE POLICY "Users manage own flashcard scores"
  ON flashcard_scores
  FOR ALL
  USING (auth.uid() = user_id);

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS flashcard_scores_user_deck_idx
  ON flashcard_scores(user_id, deck_id, created_at DESC);
