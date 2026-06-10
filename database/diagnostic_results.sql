-- diagnostic_results: 업로드 직후 진단 테스트 결과 (예상 점수 + 주제별 정오)
-- 추후 취약점 리포트 기능에서 topic_breakdown을 집계해 재사용

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_id           TEXT        NOT NULL,
  total_questions  INTEGER     NOT NULL DEFAULT 0,
  correct_count    INTEGER     NOT NULL DEFAULT 0,
  predicted_score  INTEGER     NOT NULL DEFAULT 0,
  topic_breakdown  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;

-- 사용자는 본인 결과만 접근 가능
CREATE POLICY "Users manage own diagnostic results"
  ON diagnostic_results
  FOR ALL
  USING (auth.uid() = user_id);

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS diagnostic_results_user_doc_idx
  ON diagnostic_results(user_id, doc_id, created_at DESC);
