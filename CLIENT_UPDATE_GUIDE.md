# OCR 텍스트 데이터베이스 저장 - 클라이언트 코드 업데이트 가이드

이 문서는 Zeusian.ai 프로젝트에 OCR 추출 텍스트를 데이터베이스에 저장하는 기능을 추가하기 위한 클라이언트 코드 업데이트 가이드입니다.

## 1. Supabase 데이터베이스 마이그레이션

### 1.1 필수 마이그레이션 실행
1. Supabase 대시보드 → SQL Editor 열기
2. 다음 순서로 SQL 스크립트 실행:
   - `database/ocr_text_storage.sql` (스키마 생성)
   - `database/ocr_text_backfill.sql` (백필 시스템 설정)

### 1.2 마이그레이션 확인
```sql
-- 마이그레이션 상태 확인
SELECT * FROM public.get_migration_stats();
SELECT * FROM public.ocr_migration_progress;

-- 새 컬럼 확인
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'artifacts' 
ORDER BY ordinal_position;
```

## 2. 클라이언트 코드 업데이트

### 2.1 Supabase 서비스 업데이트 (`src/services/supabase.js`)

#### 새로운 함수 추가:
```javascript
// OCR 텍스트 저장 함수
export async function saveExtractedText({ userId, docId, extractedText, metadata = {} }) {
  const client = requireSupabase();
  if (!userId || !docId || !extractedText) {
    throw new Error("userId, docId, and extractedText are required.");
  }
  
  const payload = {
    user_id: userId,
    doc_id: docId,
    extracted_text: extractedText,
    extracted_text_metadata: metadata,
    extracted_at: new Date().toISOString(),
    text_size_bytes: new Blob([extractedText]).size,
  };
  
  const { data, error } = await client
    .from('artifacts')
    .upsert(payload, { onConflict: 'user_id,doc_id' })
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

// OCR 텍스트 조회 함수
export async function fetchExtractedText({ userId, docId }) {
  if (!supabase || !userId || !docId) return null;
  
  const { data, error } = await supabase
    .from('artifacts')
    .select('extracted_text, extracted_text_metadata, extracted_at, text_size_bytes')
    .eq('user_id', userId)
    .eq('doc_id', docId)
    .maybeSingle();
    
  if (error) throw error;
  return data;
}

// 백필 마이그레이션 함수
export async function backfillOcrText({ userId, docId, extractedText, metadata = {} }) {
  const client = requireSupabase();
  
  // 저장 프로시저 호출 (SQL 함수)
  const { data, error } = await client.rpc('backfill_ocr_text_for_document', {
    p_user_id: userId,
    p_doc_id: docId,
    p_extracted_text: extractedText,
    p_metadata: metadata,
  });
  
  if (error) throw error;
  return data;
}
```

#### 기존 `saveDocArtifacts` 함수 업데이트:
```javascript
export async function saveDocArtifacts({ userId, docId, summary, quiz, ox, highlights, extractedText, extractedTextMetadata }) {
  const client = requireSupabase();
  if (!userId || !docId) throw new Error("userId and docId are required.");
  
  const payload = {
    user_id: userId,
    doc_id: docId,
  };
  
  if (summary !== undefined) payload.summary = summary;
  if (quiz !== undefined) payload.quiz_json = quiz;
  if (ox !== undefined) payload.ox_json = ox;
  if (highlights !== undefined) payload.highlights_json = highlights;
  
  // OCR 텍스트 추가
  if (extractedText !== undefined) {
    payload.extracted_text = extractedText;
    payload.extracted_text_metadata = extractedTextMetadata || {};
    payload.extracted_at = new Date().toISOString();
    payload.text_size_bytes = new Blob([extractedText]).size;
  }
  
  const { data, error } = await client
    .from(ARTIFACTS_TABLE)
    .upsert(payload, { onConflict: "user_id,doc_id" })
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

### 2.2 PDF 유틸리티 업데이트 (`src/utils/pdf.js`)

#### 텍스트 추출 함수에 캐싱 로직 추가:
```javascript
export async function extractPdfTextWithCaching(file, docId, userId, options = {}) {
  const { useOcr = false, forceRefresh = false } = options;
  
  // 1. 캐시된 텍스트 확인 (forceRefresh가 아닌 경우)
  if (!forceRefresh && docId && userId) {
    try {
      const cached = await fetchExtractedText({ userId, docId });
      if (cached?.extracted_text) {
        console.log('Using cached extracted text from database');
        return {
          text: cached.extracted_text,
          pagesUsed: cached.extracted_text_metadata?.pages_used || 0,
          totalPages: cached.extracted_text_metadata?.total_pages || 0,
          ocrUsed: cached.extracted_text_metadata?.ocr_used || false,
          fromCache: true,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch cached text:', error);
    }
  }
  
  // 2. 새로 추출
  const result = await extractPdfText(file, options.pageLimit, options.maxLength, {
    ...options,
    useOcr,
  });
  
  // 3. 데이터베이스에 저장
  if (docId && userId && result.text) {
    try {
      await saveExtractedText({
        userId,
        docId,
        extractedText: result.text,
        metadata: {
          ocr_used: result.ocrUsed || false,
          pages_used: result.pagesUsed || 0,
          total_pages: result.totalPages || 0,
          extracted_at: new Date().toISOString(),
        },
      });
      console.log('Extracted text saved to database');
    } catch (error) {
      console.warn('Failed to save extracted text:', error);
    }
  }
  
  return {
    ...result,
    fromCache: false,
  };
}
```

### 2.3 App.jsx 업데이트

#### 상태 추가:
```javascript
// 기존 상태에 추가
const [extractedTextCache, setExtractedTextCache] = useState(new Map());
```

#### 텍스트 추출 로직 업데이트:
```javascript
// 기존 extractDocumentText 호출을 대체
const extractTextWithCaching = useCallback(async (file, docId) => {
  if (!file) return null;
  
  try {
    const result = await extractPdfTextWithCaching(
      file,
      docId,
      user?.id,
      {
        pageLimit: 30,
        maxLength: 12000,
        useOcr: false, // 기본적으로 OCR 사용 안함
      }
    );
    
    // 캐시 업데이트
    if (docId && result.text) {
      setExtractedTextCache(prev => new Map(prev).set(docId, {
        text: result.text,
        timestamp: Date.now(),
        fromCache: result.fromCache,
      }));
    }
    
    return result.text;
  } catch (error) {
    console.error('Text extraction failed:', error);
    return null;
  }
}, [user?.id]);
```

#### 문서 열기 시 텍스트 사용:
```javascript
// 기존 문서 열기 로직 수정
const handleDocumentOpen = useCallback(async (fileId) => {
  // ... 기존 코드
  
  // 텍스트 추출 (캐싱 사용)
  const text = await extractTextWithCaching(file, fileId);
  setExtractedText(text);
  
  // ... 나머지 코드
}, [extractTextWithCaching]);
```

### 2.4 백필 마이그레이션 컴포넌트 생성

#### `src/components/OcrMigrationManager.jsx`:
```javascript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { extractPdfText } from '../utils/pdf';

export default function OcrMigrationManager({ userId }) {
  const [migrationStats, setMigrationStats] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [error, setError] = useState(null);

  const fetchMigrationStats = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase.rpc('get_migration_stats');
      if (error) throw error;
      setMigrationStats(data[0]);
    } catch (err) {
      console.error('Failed to fetch migration stats:', err);
    }
  }, [userId]);

  const processMigrationBatch = useCallback(async (batchSize = 5) => {
    if (!userId || isMigrating) return;
    
    setIsMigrating(true);
    setError(null);
    
    try {
      // 처리할 문서 목록 조회
      const { data: documents, error: fetchError } = await supabase.rpc(
        'get_documents_for_ocr_migration',
        { p_batch_size: batchSize, p_offset: 0 }
      );
      
      if (fetchError) throw fetchError;
      
      setProgress({ processed: 0, total: documents.length });
      
      // 각 문서 처리
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        
        try {
          // 문서 파일 다운로드
          const { data: fileData } = await supabase.storage
            .from(doc.bucket)
            .download(doc.storage_path);
          
          if (!fileData) continue;
          
          // OCR 텍스트 추출
          const extracted = await extractPdfText(fileData, 50, 50000, {
            useOcr: true,
            onOcrProgress: (message) => {
              console.log(`Processing ${doc.file_name}: ${message}`);
            },
          });
          
          if (extracted.text) {
            // 데이터베이스에 저장
            await supabase.rpc('backfill_ocr_text_for_document', {
              p_user_id: doc.user_id,
              p_doc_id: doc.doc_id,
              p_extracted_text: extracted.text,
              p_metadata: {
                ocr_used: extracted.ocrUsed,
                pages_used: extracted.pagesUsed,
                total_pages: extracted.totalPages,
                migrated_at: new Date().toISOString(),
              },
            });
          }
          
          setProgress(prev => ({ ...prev, processed: i + 1 }));
          
        } catch (docError) {
          console.error(`Failed to process document ${doc.doc_id}:`, docError);
        }
      }
      
      // 통계 업데이트
      await fetchMigrationStats();
      
    } catch (err) {
      setError(err.message);
      console.error('Migration failed:', err);
    } finally {
      setIsMigrating(false);
    }
  }, [userId, isMigrating, fetchMigrationStats]);

  useEffect(() => {
    fetchMigrationStats();
  }, [fetchMigrationStats]);

  if (!migrationStats) return null;

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">OCR 텍스트 마이그레이션</h3>
      
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div>
            <p className="text-sm text-gray-600">총 문서</p>
            <p className="text-xl font-bold">{migrationStats.total_documents}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">완료</p>
            <p className="text-xl font-bold text-green-600">
              {migrationStats.completed_migration}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">대기중</p>
            <p className="text-xl font-bold text-yellow-600">
              {migrationStats.pending_migration}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">실패</p>
            <p className="text-xl font-bold text-red-600">
              {migrationStats.failed_migration}
            </p>
          </div>
        </div>
        
        {migrationStats.total_text_size_bytes > 0 && (
          <p className="text-sm text-gray-600">
            저장된 텍스트: {(migrationStats.total_text_size_bytes / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
      </div>
      
      {isMigrating ? (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm">처리 중...</span>
            <span className="text-sm">
              {progress.processed} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.processed / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : migrationStats.pending_migration > 0 ? (
        <button
          onClick={() => processMigrationBatch(5)}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          마이그레이션 시작 ({migrationStats.pending_migration}개 문서)
        </button>
      ) : (
        <p className="text-green-600 font-medium">모든 마이그레이션이 완료되었습니다!</p>
      )}
      
      {error && (
        <p className="mt-2 text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
}
```

## 3. 마이그레이션 실행 순서

### 3.1 1단계: 데이터베이스 설정
1. Supabase SQL Editor에서 `ocr_text_storage.sql` 실행
2. `ocr_text_backfill.sql` 실행
3. RLS 정책 확인: `ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;`

### 3.2 2단계: 클라이언트 코드 업데이트
1. `src/services/supabase.js`에 새 함수 추가
2. `src/utils/pdf.js`에 캐싱 함수 추가
3. `src/App.jsx`에서 텍스트 추출 로직 업데이트
4. (선택) `OcrMigrationManager` 컴포넌트 추가

### 3.3 3단계: 테스트
1. 새 문서 업로드 → 텍스트가 DB에 저장되는지 확인
2. 동일 문서 재열기 → 캐시에서 텍스트 로드되는지 확인
3. 백필 마이그레이션 실행 → 기존 문서 처리

### 3.4 4단계: 모니터링
```sql
-- 주기적으로 실행하여 진행상황 확인
SELECT * FROM public.ocr_migration_progress;
SELECT * FROM public.document_text_summary LIMIT 10;

-- 저장 공간 사용량
SELECT 
  COUNT(*) as documents_with_text,
  SUM(text_size_bytes) / 1024 / 1024 as total_mb,
  AVG(text_size_bytes) / 1024 as avg_kb
FROM public.artifacts 
WHERE extracted_text IS NOT NULL;
```

## 4. 예상 효과

### 4.1 토큰 비용 절감
- 동일 문서 재처리 시 AI 토큰 비용 90% 이상 절감
- OCR 처리 비용 감소 (재처리 불필요)

### 4.2 성능 향상
- 문서 열기 시간 단축 (텍스트 추출 단계 생략)
- 사용자 경험 개선

### 4.3 추가 기능
- 오프라인 모드 지원 가능
- 문서 검색 기능 확장
- 텍스트 분석 기능 추가 가능

## 5. 주의사항

### 5.1 저장 공간
- 평균 문서당 100KB ~ 1MB 예상
- 1,000개 문서 ≈ 500MB ~ 1GB
- 정기적인 정리 (TTL) 필요

### 5.2 개인정보 보호
- 사용자 동의 필요
- 데이터 암호화 고려
- 유럽 GDPR, 한국 개인정보보호법 준수

### 5.3 점진적 롤아웃
1. 새 문서부터 적용
2. 기존 문서 점진적 마이그레이션
3. 문제 발생 시 롤백 가능

## 6. 문제 해결

### 6.1 일반적인 문제
- **RLS 정책 오류**: `auth.uid()` 함수 확인
- **저장 공간 부족**: `cleanup_old_extracted_text()` 실행
- **성능 문제**: 인덱스 생성 확인

### 6.2 디버깅
```sql
-- 문제 진단용 쿼리
SELECT 
  migration_status,
  COUNT(*),
  MAX(updated_at)
FROM public.ocr_migration_log
GROUP BY migration_status;

-- 실패한 문서 확인
SELECT * FROM public.ocr_migration_log 
WHERE migration_status = 'failed'
