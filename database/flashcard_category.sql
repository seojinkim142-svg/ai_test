-- flashcards 테이블에 category 컬럼 추가
-- 단어장 모드에서 학습구조(topicStructure) 기반 카테고리 자동 분류

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- 카테고리별 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS flashcards_category_idx ON flashcards(user_id, deck_id, category);
