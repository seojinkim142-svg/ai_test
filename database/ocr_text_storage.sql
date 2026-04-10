-- OCR 텍스트 저장을 위한 데이터베이스 스키마 마이그레이션
-- 이 파일은 artifacts 테이블에 OCR 추출 텍스트 저장 기능을 추가합니다.

-- 1. artifacts 테이블에 OCR 텍스트 관련 컬럼 추가
ALTER TABLE IF EXISTS public.artifacts
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS extracted_text_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS extracted_text_metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS text_size_bytes INTEGER DEFAULT 0;

-- 2. extracted_text_hash 인덱스 추가 (빠른 조회를 위해)
CREATE INDEX IF NOT EXISTS artifacts_extracted_text_hash_idx 
  ON public.artifacts (extracted_text_hash) 
  WHERE extracted_text_hash IS NOT NULL;

-- 3. text_size_bytes 인덱스 추가 (큰 텍스트 관리용)
CREATE INDEX IF NOT EXISTS artifacts_text_size_bytes_idx 
  ON public.artifacts (text_size_bytes) 
  WHERE text_size_bytes > 0;

-- 4. extracted_at 인덱스 추가 (TTL 정리용)
CREATE INDEX IF NOT EXISTS artifacts_extracted_at_idx 
  ON public.artifacts (extracted_at) 
  WHERE extracted_at IS NOT NULL;

-- 5. 업로드된 문서별 텍스트 요약 정보를 저장할 뷰 생성
CREATE OR REPLACE VIEW public.document_text_summary AS
SELECT 
  a.user_id,
  a.doc_id,
  u.file_name,
  u.file_size,
  a.extracted_at,
  a.text_size_bytes,
  CASE 
    WHEN a.extracted_text IS NOT NULL THEN 'stored'
    ELSE 'not_stored'
  END as text_status,
  LENGTH(a.extracted_text) as text_length,
  COALESCE((a.extracted_text_metadata->>'ocr_used')::BOOLEAN, false) as ocr_used,
  COALESCE((a.extracted_text_metadata->>'pages_used')::INTEGER, 0) as pages_used,
  COALESCE((a.extracted_text_metadata->>'total_pages')::INTEGER, 0) as total_pages
FROM public.artifacts a
LEFT JOIN public.uploads u ON a.doc_id::UUID = u.id
WHERE a.extracted_text IS NOT NULL;

-- 6. 텍스트 크기별 통계를 위한 함수
CREATE OR REPLACE FUNCTION public.calculate_text_storage_stats()
RETURNS TABLE(
  total_documents BIGINT,
  total_text_size_bytes BIGINT,
  avg_text_size_bytes NUMERIC,
  max_text_size_bytes BIGINT,
  documents_with_ocr BIGINT,
  documents_without_text BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT a.doc_id) as total_documents,
    COALESCE(SUM(a.text_size_bytes), 0) as total_text_size_bytes,
    COALESCE(AVG(a.text_size_bytes), 0) as avg_text_size_bytes,
    COALESCE(MAX(a.text_size_bytes), 0) as max_text_size_bytes,
    COUNT(DISTINCT CASE WHEN (a.extracted_text_metadata->>'ocr_used')::BOOLEAN = true THEN a.doc_id END) as documents_with_ocr,
    COUNT(DISTINCT CASE WHEN a.extracted_text IS NULL THEN a.doc_id END) as documents_without_text
  FROM public.artifacts a;
END;
$$ LANGUAGE plpgsql;

-- 7. 오래된 텍스트를 정리하는 함수 (TTL: 90일)
CREATE OR REPLACE FUNCTION public.cleanup_old_extracted_text(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    UPDATE public.artifacts
    SET 
      extracted_text = NULL,
      extracted_text_hash = NULL,
      extracted_text_metadata = JSONB_SET(
        COALESCE(extracted_text_metadata, '{}'::JSONB),
        '{cleaned_at}',
        TO_JSONB(NOW())
      ),
      text_size_bytes = 0
    WHERE 
      extracted_at < NOW() - (days_old || ' days')::INTERVAL
      AND extracted_text IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 8. 텍스트 해시 생성 함수 (중복 저장 방지)
CREATE OR REPLACE FUNCTION public.generate_text_hash(text_content TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN ENCODE(DIGEST(text_content, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- 9. 텍스트 저장 프로시저
CREATE OR REPLACE PROCEDURE public.save_extracted_text(
  p_user_id UUID,
  p_doc_id UUID,
  p_extracted_text TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_text_hash VARCHAR(64);
  v_text_size INTEGER;
  v_existing_hash VARCHAR(64);
BEGIN
  -- 텍스트 해시 계산
  v_text_hash := public.generate_text_hash(p_extracted_text);
  v_text_size := OCTET_LENGTH(p_extracted_text);
  
  -- 기존 해시 확인
  SELECT extracted_text_hash INTO v_existing_hash
  FROM public.artifacts
  WHERE user_id = p_user_id AND doc_id = p_doc_id;
  
  -- 해시가 동일하면 업데이트 불필요
  IF v_existing_hash = v_text_hash THEN
    RETURN;
  END IF;
  
  -- artifacts 업데이트 또는 삽입
  INSERT INTO public.artifacts (
    user_id,
    doc_id,
    extracted_text,
    extracted_text_hash,
    extracted_text_metadata,
    extracted_at,
    text_size_bytes
  )
  VALUES (
    p_user_id,
    p_doc_id,
    p_extracted_text,
    v_text_hash,
    JSONB_SET(
      COALESCE(p_metadata, '{}'::JSONB),
      '{stored_at}',
      TO_JSONB(NOW())
    ),
    NOW(),
    v_text_size
  )
  ON CONFLICT (user_id, doc_id) 
  DO UPDATE SET
    extracted_text = EXCLUDED.extracted_text,
    extracted_text_hash = EXCLUDED.extracted_text_hash,
    extracted_text_metadata = EXCLUDED.extracted_text_metadata,
    extracted_at = EXCLUDED.extracted_at,
    text_size_bytes = EXCLUDED.text_size_bytes;
    
  RAISE NOTICE 'Text saved for document % (size: % bytes)', p_doc_id, v_text_size;
END;
$$;

-- 10. 텍스트 조회 함수 (압축 해제 포함)
CREATE OR REPLACE FUNCTION public.get_extracted_text(
  p_user_id UUID,
  p_doc_id UUID,
  p_include_metadata BOOLEAN DEFAULT false
)
RETURNS TABLE(
  extracted_text TEXT,
  extracted_at TIMESTAMP WITH TIME ZONE,
  text_size_bytes INTEGER,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.extracted_text,
    a.extracted_at,
    a.text_size_bytes,
    CASE 
      WHEN p_include_metadata THEN a.extracted_text_metadata
      ELSE '{}'::JSONB
    END as metadata
  FROM public.artifacts a
  WHERE a.user_id = p_user_id 
    AND a.doc_id = p_doc_id
    AND a.extracted_text IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- 11. RLS (Row Level Security) 정책 업데이트
-- artifacts 테이블에 대한 읽기/쓰기 정책 확인 및 업데이트
DO $$
BEGIN
  -- 읽기 정책: 사용자는 자신의 artifacts만 볼 수 있음
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artifacts' AND policyname = 'Users can view their own artifacts'
  ) THEN
    CREATE POLICY "Users can view their own artifacts"
      ON public.artifacts
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  
  -- 쓰기 정책: 사용자는 자신의 artifacts만 수정할 수 있음
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artifacts' AND policyname = 'Users can update their own artifacts'
  ) THEN
    CREATE POLICY "Users can update their own artifacts"
      ON public.artifacts
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 12. 마이그레이션 완료 메시지
COMMENT ON TABLE public.artifacts IS '문서 아티팩트 및 OCR 추출 텍스트 저장 테이블';
COMMENT ON COLUMN public.artifacts.extracted_text IS 'OCR로 추출된 원본 텍스트';
COMMENT ON COLUMN public.artifacts.extracted_text_hash IS '텍스트 해시 (중복 저장 방지)';
COMMENT ON COLUMN public.artifacts.extracted_text_metadata IS '추출 메타데이터 (ocr_used, pages_used 등)';
COMMENT ON COLUMN public.artifacts.extracted_at IS '텍스트 추출 시간';
COMMENT ON COLUMN public.artifacts.text_size_bytes IS '텍스트 크기 (바이트)';

-- 마이그레이션 실행 지침:
-- 1. Supabase SQL 에디터에서 이 스크립트 실행
-- 2. RLS가 활성화되어 있는지 확인: ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
-- 3. 기존 데이터 마이그레이션을 위한 백필 스크립트 실행 (선택사항)