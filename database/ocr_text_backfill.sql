-- OCR 텍스트 백필 마이그레이션 스크립트
-- 기존 문서들의 OCR 텍스트를 점진적으로 마이그레이션하기 위한 스크립트
-- 주의: 이 스크립트는 한 번에 실행하기보다는 배치로 나눠서 실행하는 것이 좋습니다.

-- 1. 마이그레이션 진행 상황 추적을 위한 테이블 생성
CREATE TABLE IF NOT EXISTS public.ocr_migration_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  doc_id UUID NOT NULL,
  migration_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  migration_started_at TIMESTAMP WITH TIME ZONE,
  migration_completed_at TIMESTAMP WITH TIME ZONE,
  text_size_bytes INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, doc_id)
);

-- 2. 마이그레이션 로그 인덱스
CREATE INDEX IF NOT EXISTS ocr_migration_log_status_idx 
  ON public.ocr_migration_log (migration_status);
CREATE INDEX IF NOT EXISTS ocr_migration_log_user_doc_idx 
  ON public.ocr_migration_log (user_id, doc_id);

-- 3. 마이그레이션할 문서 목록 조회 함수
CREATE OR REPLACE FUNCTION public.get_documents_for_ocr_migration(
  p_batch_size INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  user_id UUID,
  doc_id UUID,
  file_name TEXT,
  storage_path TEXT,
  bucket TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.user_id,
    u.id as doc_id,
    u.file_name,
    u.storage_path,
    u.bucket,
    u.created_at
  FROM public.uploads u
  LEFT JOIN public.ocr_migration_log m ON u.user_id = m.user_id AND u.id::UUID = m.doc_id::UUID
  WHERE m.id IS NULL  -- 아직 마이그레이션되지 않은 문서
  ORDER BY u.created_at DESC  -- 최신 문서부터 처리
  LIMIT p_batch_size
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 4. 마이그레이션 상태 업데이트 함수
CREATE OR REPLACE FUNCTION public.update_migration_status(
  p_user_id UUID,
  p_doc_id UUID,
  p_status VARCHAR(20),
  p_text_size INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ocr_migration_log (
    user_id,
    doc_id,
    migration_status,
    migration_started_at,
    migration_completed_at,
    text_size_bytes,
    error_message,
    updated_at
  )
  VALUES (
    p_user_id,
    p_doc_id,
    p_status,
    CASE WHEN p_status = 'processing' THEN NOW() ELSE NULL END,
    CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE NULL END,
    p_text_size,
    p_error_message,
    NOW()
  )
  ON CONFLICT (user_id, doc_id) 
  DO UPDATE SET
    migration_status = EXCLUDED.migration_status,
    migration_started_at = COALESCE(EXCLUDED.migration_started_at, ocr_migration_log.migration_started_at),
    migration_completed_at = COALESCE(EXCLUDED.migration_completed_at, ocr_migration_log.migration_completed_at),
    text_size_bytes = COALESCE(EXCLUDED.text_size_bytes, ocr_migration_log.text_size_bytes),
    error_message = EXCLUDED.error_message,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- 5. 마이그레이션 통계 조회 함수
CREATE OR REPLACE FUNCTION public.get_migration_stats()
RETURNS TABLE(
  total_documents BIGINT,
  pending_migration BIGINT,
  processing_migration BIGINT,
  completed_migration BIGINT,
  failed_migration BIGINT,
  total_text_size_bytes BIGINT,
  avg_text_size_bytes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.uploads) as total_documents,
    COUNT(CASE WHEN m.migration_status = 'pending' THEN 1 END) as pending_migration,
    COUNT(CASE WHEN m.migration_status = 'processing' THEN 1 END) as processing_migration,
    COUNT(CASE WHEN m.migration_status = 'completed' THEN 1 END) as completed_migration,
    COUNT(CASE WHEN m.migration_status = 'failed' THEN 1 END) as failed_migration,
    COALESCE(SUM(m.text_size_bytes), 0) as total_text_size_bytes,
    COALESCE(AVG(m.text_size_bytes), 0) as avg_text_size_bytes
  FROM public.ocr_migration_log m;
END;
$$ LANGUAGE plpgsql;

-- 6. 백필 마이그레이션 프로시저 (클라이언트에서 호출할 수 있음)
CREATE OR REPLACE PROCEDURE public.backfill_ocr_text_for_document(
  p_user_id UUID,
  p_doc_id UUID,
  p_extracted_text TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_text_size INTEGER;
BEGIN
  -- 마이그레이션 시작 상태 기록
  PERFORM public.update_migration_status(p_user_id, p_doc_id, 'processing');
  
  BEGIN
    -- 텍스트 저장
    CALL public.save_extracted_text(
      p_user_id,
      p_doc_id,
      p_extracted_text,
      p_metadata
    );
    
    -- 텍스트 크기 계산
    v_text_size := OCTET_LENGTH(p_extracted_text);
    
    -- 마이그레이션 완료 상태 기록
    PERFORM public.update_migration_status(
      p_user_id,
      p_doc_id,
      'completed',
      v_text_size,
      NULL
    );
    
    RAISE NOTICE '백필 완료: 문서 % (크기: % bytes)', p_doc_id, v_text_size;
    
  EXCEPTION WHEN OTHERS THEN
    -- 오류 발생 시 상태 기록
    PERFORM public.update_migration_status(
      p_user_id,
      p_doc_id,
      'failed',
      NULL,
      SQLERRM
    );
    
    RAISE WARNING '백필 실패: 문서 % - %', p_doc_id, SQLERRM;
  END;
END;
$$;

-- 7. 점진적 백필을 위한 배치 처리 함수
CREATE OR REPLACE FUNCTION public.process_ocr_migration_batch(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE(
  processed_count INTEGER,
  success_count INTEGER,
  failure_count INTEGER
) AS $$
DECLARE
  v_doc RECORD;
  v_processed INTEGER := 0;
  v_success INTEGER := 0;
  v_failure INTEGER := 0;
BEGIN
  -- 처리할 문서 목록 조회 (pending 상태)
  FOR v_doc IN 
    SELECT user_id, doc_id 
    FROM public.ocr_migration_log 
    WHERE migration_status = 'pending'
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    -- 여기서는 실제 OCR 처리를 할 수 없으므로 클라이언트 측 처리 필요
    -- 클라이언트가 이 문서를 처리한 후 backfill_ocr_text_for_document 호출
    -- 현재는 플레이스홀더로 남겨둠
    
    RAISE NOTICE '문서 처리 대기: user_id=%, doc_id=%', v_doc.user_id, v_doc.doc_id;
    
  END LOOP;
  
  RETURN QUERY SELECT v_processed, v_success, v_failure;
END;
$$ LANGUAGE plpgsql;

-- 8. 마이그레이션 재시도 함수
CREATE OR REPLACE PROCEDURE public.retry_failed_migrations(
  p_max_retries INTEGER DEFAULT 3
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_failed_docs CURSOR FOR
    SELECT user_id, doc_id, error_message
    FROM public.ocr_migration_log
    WHERE migration_status = 'failed'
      AND (updated_at < NOW() - INTERVAL '1 hour' OR updated_at IS NULL)
    LIMIT 50;
  v_doc RECORD;
BEGIN
  FOR v_doc IN v_failed_docs LOOP
    -- 실패한 마이그레이션을 pending 상태로 재설정
    UPDATE public.ocr_migration_log
    SET 
      migration_status = 'pending',
      error_message = NULL,
      updated_at = NOW()
    WHERE user_id = v_doc.user_id AND doc_id = v_doc.doc_id;
    
    RAISE NOTICE '재시도 설정: user_id=%, doc_id=%', v_doc.user_id, v_doc.doc_id;
  END LOOP;
END;
$$;

-- 9. 초기 마이그레이션 데이터 설정
-- 기존 uploads 테이블의 모든 문서를 마이그레이션 대기열에 추가
INSERT INTO public.ocr_migration_log (user_id, doc_id, migration_status)
SELECT DISTINCT 
  u.user_id,
  u.id as doc_id,
  'pending' as migration_status
FROM public.uploads u
LEFT JOIN public.ocr_migration_log m ON u.user_id = m.user_id AND u.id::UUID = m.doc_id::UUID
WHERE m.id IS NULL
ON CONFLICT (user_id, doc_id) DO NOTHING;

-- 10. 마이그레이션 모니터링 뷰
CREATE OR REPLACE VIEW public.ocr_migration_progress AS
SELECT
  m.migration_status,
  COUNT(*) as document_count,
  COALESCE(SUM(m.text_size_bytes), 0) as total_text_size,
  COALESCE(AVG(m.text_size_bytes), 0) as avg_text_size,
  MIN(m.created_at) as first_created,
  MAX(m.updated_at) as last_updated
FROM public.ocr_migration_log m
GROUP BY m.migration_status
ORDER BY 
  CASE m.migration_status
    WHEN 'completed' THEN 1
    WHEN 'processing' THEN 2
    WHEN 'pending' THEN 3
    WHEN 'failed' THEN 4
    ELSE 5
  END;

-- 실행 지침:
-- 1. 먼저 ocr_text_storage.sql 실행
-- 2. 이 스크립트 실행
-- 3. 클라이언트에서 백필 처리 구현:
--    - get_documents_for_ocr_migration()로 처리할 문서 조회
--    - 각 문서에 대해 OCR 텍스트 추출
--    - backfill_ocr_text_for_document()로 결과 저장
-- 4. 주기적으로 process_ocr_migration_batch() 호출하여 진행상황 모니터링

-- 초기 통계 확인:
SELECT * FROM public.get_migration_stats();
SELECT * FROM public.ocr_migration_progress;