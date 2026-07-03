# Zeusian.ai — AI 컨텍스트 가이드

이 파일은 AI 어시스턴트가 이 프로젝트를 처음 볼 때 반드시 읽어야 할 핵심 정보를 담고 있습니다.

---

## 사용자가 할 수 있는 모든 기능

### 1. 문서 업로드 & 관리

- **PDF 업로드**: 드래그 앤 드롭 또는 파일 선택. 티어별 최대 파일 크기 제한 (free: 10MB, pro/premium: 25MB).
- **DOCX / PPTX 업로드**: 서버(Gotenberg)에서 자동으로 PDF로 변환. 원본 파일은 그대로 보관되고 변환된 PDF 미리보기가 별도 저장된다.
- **이미지 OCR**: 이미지 파일 업로드 시 Tesseract.js로 텍스트 추출.
- **파일 삭제**: 업로드된 파일 및 관련 아티팩트 삭제.
- **폴더 관리** (Pro/Family): 폴더 생성, 파일을 폴더로 이동, 폴더 삭제. 폴더 단위 통합 학습 지원.
- **파일 목록 & 선택**: 업로드 목록에서 파일 선택 → 상세 화면 진입. 클릭 즉시 상세 화면으로 이동하고 파일 준비는 백그라운드에서 진행.

---

### 2. 요약 (Summary)

- **전체 요약**: 문서 전체 내용을 AI가 자동 요약. Markdown + KaTeX 수식 지원.
- **챕터 범위 구간 요약**: PDF 목차(TOC)를 자동 감지해 챕터별로 분할 요약. 사용자가 챕터 번호를 직접 입력할 수도 있음 (예: `3`, `3-5`, `1,3,5`).
  - 챕터 범위가 지정되면 해당 범위 텍스트만 추출해 챕터별로 나눠 요약.
  - 챕터 범위 없이 생성 시 전체 문서 적응형 분할 요약.
- **요약 PDF 내보내기**: 생성된 요약을 PDF 파일로 다운로드.
- **증거 페이지 링크**: 요약 내 각 항목의 원문 출처 페이지로 바로 이동.
- **요약 재생성**: 기존 요약이 있어도 새로 생성 가능.

관련 코드: [src/components/SummaryCard.jsx](src/components/SummaryCard.jsx), [src/App.jsx](src/App.jsx) (요약 생성 로직)

---

### 3. 퀴즈 (Quiz)

- **객관식 퀴즈 (5문항)**: 4지선다. 선택 후 즉시 정오답 표시 + 해설.
- **주관식 퀴즈**: 단답형 주관식 문제. 직접 답 입력 후 정답 비교.
- **퀴즈 믹스** (OX + 객관식 + 주관식 혼합, 총 7문제): 세 유형이 섞인 복합 퀴즈. 렌더링 순서는 OX → 객관식 → 주관식.
- **챕터 범위 지정 퀴즈**: 특정 챕터(들)만 대상으로 퀴즈 생성.
- **추가 요청 프롬프트**: 퀴즈 생성 시 스타일이나 난이도 등 추가 요청 입력 가능.
- **문제 삭제**: 생성된 퀴즈 중 특정 문제 개별 삭제.
- **중복 방지**: 이미 생성된 문제와 동일한 내용의 문제는 자동 제외.

관련 코드: [src/components/QuizSection.jsx](src/components/QuizSection.jsx)

---

### 4. OX 문제

- **OX 문제 생성**: 참(O) / 거짓(X) 형식 문제. 문제가 모호하면 "문제가 애매해요(skip)" 선택 가능.
- **정오답 + 해설**: 선택 후 정오답 여부와 해설 표시.
- **증거 페이지 링크**: 각 OX 문제의 근거가 되는 원문 페이지로 이동.
- **챕터 범위 지정 OX**: 특정 챕터(들)만 대상으로 OX 문제 생성.
- **오답 오답노트 자동 저장**: 틀린 OX 문제는 오답노트에 자동 기록.

관련 코드: [src/components/OxSection.jsx](src/components/OxSection.jsx)

---

### 5. 모의고사 (Mock Exam)

- **모의고사 생성**: 문서 기반 모의고사 세트 생성. 객관식 + 주관식 혼합.
- **챕터 범위 지정 모의고사**: 원하는 챕터 범위만 대상으로 생성.
- **추가 요청 프롬프트**: 모의고사 스타일/난이도 추가 지정.
- **저장 & 불러오기**: 생성된 모의고사는 Supabase(`mock_exams` 테이블)에 저장. 이전 모의고사 불러오기 가능.
- **답안지 PDF 내보내기**: 모의고사 답안지를 PDF로 다운로드.
- **모의고사 삭제**: 저장된 모의고사 삭제.

---

### 6. 플래시카드 (Flashcards)

- **AI 자동 생성** (8장): 문서 내용을 기반으로 앞면(질문) / 뒷면(답) 플래시카드 자동 생성.
- **챕터 범위 지정**: 특정 챕터만 대상으로 플래시카드 생성.
- **수동 추가**: 앞면 / 뒷면 / 힌트를 직접 입력해 카드 추가.
- **카드 삭제**: 개별 카드 삭제.
- **시험 모드**: 셔플된 카드를 한 장씩 넘기며 학습. 카드 뒤집기로 답 확인. "알아요" / "몰라요" 분류.
- **점수 기록 & 히스토리**: 시험 완료 후 정답률 저장. 최근 50회 기록 열람 (localStorage 저장).

관련 코드: [src/components/FlashcardsPanel.jsx](src/components/FlashcardsPanel.jsx)

---

### 7. AI 튜터 (AI Tutor)

- **자유 질문 대화**: 문서 내용 기반으로 자유롭게 질문. 멀티턴 대화 지원.
- **이미지 첨부 질문**: 이미지 파일을 첨부해 질문 가능 (이미지 파일만 허용).
- **챕터/섹션 지정 질문**: 특정 챕터나 섹션을 지정해서 해당 범위에 대해 집중 질문.
- **수식 렌더링**: KaTeX로 수학 수식 자동 렌더링.
- **대화 초기화**: 대화 내역 전체 초기화.
- **출력 언어 연동**: 설정된 출력 언어로 답변 생성.

관련 코드: [src/components/AiTutorPanel.jsx](src/components/AiTutorPanel.jsx)

---

### 8. 오답노트 (Review Notes)

- **자동 기록**: 퀴즈·OX·모의고사에서 틀린 문제가 오답노트에 자동 저장.
- **재도전**: 저장된 문제를 다시 풀기. 정답 시 "해결됨" 처리.
- **필터**: 전체 / 복습 필요 / 해결됨 으로 필터링.
- **오답 횟수 추적**: 각 문제별 틀린 횟수와 최근 오답/정답 기록 표시.
- **오답노트 기반 추가 생성**: 오답 문제들을 묶어 오답노트 전용 퀴즈/OX 재생성.
- **챕터 범위 지정**: 특정 챕터의 오답만 모아서 보기.

---

### 9. 시험 직전 정리 (Exam Cram)

- **통합 AI 정리 생성**: 요약 + 퀴즈 + OX + 오답노트를 종합해 "이것만 보면 되는" 시험 직전 AI 최종 정리 생성.
- **최근 오답 미리보기**: 오답노트의 최근 틀린 문제를 참고 자료로 함께 표시.
- **참고 자료 링크**: 요약 / 퀴즈 / OX / 오답노트 각 섹션으로 바로 이동.
- **챕터 범위 지정**: 원하는 챕터 범위 기준으로 생성.

---

### 10. 폴더 통합 학습 (Folder Aggregate Study)

> Pro / Family 플랜 전용

- **폴더 생성**: 이름을 지어 폴더 생성. 파일들을 폴더로 묶기.
- **폴더 단위 요약 / 퀴즈 / OX**: 폴더에 속한 여러 파일을 합쳐 통합 학습 기능 실행.
  - 최대 합산 텍스트: `FOLDER_AGGREGATE_MAX_LENGTH = 60,000자`, 파일당 `14,000자` 제한.
- **폴더 삭제**: 폴더 내 파일이 없을 때만 삭제 가능.

---

### 11. 프리미엄 프로필 공간 (Premium Profile)

> Family 플랜 전용 (최대 4개 프로필)

- **프로필 생성**: 이름 + 4자리 PIN 설정. 최대 4개까지 생성.
- **프로필 전환**: PIN 입력 후 다른 프로필의 학습 공간으로 전환. 각 프로필은 독립적인 파일·학습 데이터 공간.
- **프로필 이름 변경**: PIN 인증 후 이름 수정.
- **공유 워크스페이스**: 프로필 공간 외에 멤버 전체가 공유하는 학습 공간 별도 제공.
- **프로필 아바타 & 색상**: 4가지 색상 프리셋 중 선택.

관련 코드: [src/components/PremiumProfilePicker.jsx](src/components/PremiumProfilePicker.jsx)

---

### 12. 결제 & 구독

#### 플랜
| 플랜 | 가격 | 주요 제한 |
|---|---|---|
| **Free** | 무료 | PDF 최대 4개, 요약·퀴즈·OX 기본 기능 |
| **Pro** | 6,900원 / 월 | 업로드 무제한, 플래시카드, 우선 처리 |
| **Family** | 18,900원 / 월 | Pro 기능 + 최대 4명 프로필, 공유 워크스페이스 |

- **Pro 7일 무료 체험**: 최초 1회. 체험 후 자동 구독 전환.

#### 결제 수단
- **카카오페이**: 일회성 및 정기 구독. `KAKAOPAY_SUBSCRIPTION_CID` 기반.
- **NicePayments 카드**: Postart REST 방식. 카드 등록 → BID 발급 → 정기 청구.
- 구독 취소: 설정 화면에서 즉시 가능. 취소 후 만료일까지 서비스 유지.

---

### 13. 설정 (Settings)

- **테마 전환**: 다크 / 라이트 모드.
- **출력 언어 변경**: AI 응답 언어 선택 (한국어 · 영어 · 중국어 · 일본어 · 힌디). 설정값은 localStorage에 저장.
- **구독 상태 확인**: 현재 플랜, 만료일, 잔여 일수 표시.
- **구독 취소**: 카카오페이 / NicePayments 구독 해지.
- **피드백 제출**: 버그·기능 요청·UX 피드백 전송 (카테고리 선택 가능).
- **로그아웃**: 계정 로그아웃.
- **계정 정보**: 현재 로그인된 이메일, 티어, 프로필 정보 확인.

---

### 14. Chrome 확장 프로그램

> `chrome-extension/` 폴더. 별도 설치 필요.

- **선택 텍스트 캡처**: 웹 페이지에서 텍스트 선택 → 컨텍스트 메뉴로 Zeusian에 저장.
- **페이지 스냅샷 캡처**: 현재 탭의 페이지 전체를 스냅샷으로 저장.
- **클립 히스토리**: 저장한 클립 목록 열람.
- **현재 페이지 AI 요약**: 팝업에서 현재 탭의 내용을 AI로 즉시 요약.
- **Zeusian.ai 바로 열기**: 팝업에서 앱 바로 실행.
- **계정 연동**: Supabase 이메일 로그인으로 확장 프로그램과 앱 세션 공유.

---

### 15. PDF 뷰어 & 미리보기

- **인라인 PDF 미리보기**: 상세 화면 좌측에 PDF 페이지 렌더링 (PDF.js).
- **페이지 이동**: 증거 페이지 링크 클릭 시 해당 페이지로 자동 이동.
- **썸네일**: 파일 목록에서 PDF 첫 페이지 썸네일 표시. DOCX/PPTX는 변환 후 PDF 썸네일 사용.

---

### 기능별 티어 제한 요약

| 기능 | Free | Pro | Family |
|---|---|---|---|
| 파일 업로드 | 최대 4개 / 10MB | 무제한 / 25MB | 무제한 / 25MB |
| 요약 | O | O | O |
| 퀴즈 / OX | O | O | O |
| 플래시카드 | X | O | O |
| 챕터 범위 요약·퀴즈 | X | O | O |
| 모의고사 | X | O | O |
| 오답노트 | X | O | O |
| 시험 직전 정리 | X | O | O |
| 폴더 통합 학습 | X | O | O |
| 프리미엄 프로필 (최대 4명) | X | X | O |
| 공유 워크스페이스 | X | X | O |

> **주의**: 정확한 제한값은 `src/utils/appStateHelpers.js`의 `PDF_MAX_SIZE_BY_TIER` 참조. Free 티어의 생성 횟수 제한은 `src/App.jsx`의 `limits` useMemo(요약/퀴즈/OX/플래시카드 각 1회, 업로드 4개)와 `hasReached()` 콜백으로 판정하며, 실제 카운트 저장은 `src/utils/studyArtifacts.js`의 `FREE_USAGE_ARTIFACT_KEY`(`bumpFreeUsageCount` 등)가 담당한다.

---

## 프로젝트 개요

**Zeusian.ai** — AI 기반 PDF 학습 보조 서비스.  
React + Vite SPA. Supabase(인증·DB·스토리지), DeepSeek AI API, Capacitor(Android 네이티브 앱)를 사용한다.

- 브랜드명: `Zeusian.ai` (UI 표기 기준). 코드·외부 연동에서는 `Zeusian` 또는 `zeusian` 사용.
- 앱 ID: `com.tjwls.examstudyai`
- 배포: Vercel (웹), Google Play (Android AAB)

---

## 디렉터리 구조 핵심

```
src/
  App.jsx              # 메인 진입점 — 거대 단일 파일(~5,565줄). 상태 관리 총괄.
  constants.js         # MODEL = "deepseek-chat", LETTERS
  config/auth.js       # AUTH_ENABLED 플래그
  pages/               # 5개 페이지 컴포넌트
    StartPage.jsx      # 랜딩·로그인 화면
    DetailPage.jsx     # PDF 상세 화면 (요약·퀴즈·튜터·플래시카드 등 패널 조립)
    LegalPage.jsx      # 약관/개인정보
    PromoPage.jsx      # 프로모션 랜딩(다국어 출력언어 감지)
    ShowcasePage.jsx   # 마케팅용 쇼케이스 랜딩(요금제/기능 타임라인). main.jsx에서 경로 `/showcase`일 때만 렌더링
  components/          # UI 컴포넌트 (최상위 39개 + ui/, summary/, diagnostic/ 서브폴더)
  hooks/               # 커스텀 훅 (19개)
  services/            # 외부 API 클라이언트
  utils/               # 순수 유틸리티
  legal/               # 약관 텍스트

api/                   # Vercel Serverless Functions
  _shared/             # 공통 설정
  openai/              # DeepSeek 프록시 (OPENAI 명칭이지만 실제로는 DeepSeek)
  kakaopay/            # 카카오페이 결제
  nicepayments/        # NicePayments 카드 결제
  feedback/            # 피드백 이메일
  document/            # DOCX/PPTX → PDF 변환 (Gotenberg)
  # stripe/ 는 삭제됨 — 결제는 kakaopay/nicepayments만 사용

server/                # 로컬 개발용 독립 서버 (포트 8787~8793)
database/              # Supabase SQL 스키마 파일
android/               # Capacitor Android 프로젝트
chrome-extension/      # Chrome 확장 프로그램
```

---

## AI 모델

- **실제 사용 모델**: `deepseek-chat` (`src/constants.js`)
- API 엔드포인트: `/api/openai` (Vite 프록시 또는 Vercel Function이 DeepSeek upstream으로 포워딩)
- 환경변수: `VITE_DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEY`, `VITE_DEEPSEEK_BASE_URL`
- 변수명에 `openai`가 남아 있는 것은 DeepSeek가 OpenAI 호환 API를 제공하기 때문 — 혼동 주의

---

## 주요 서비스 & 훅

| 파일 | 역할 |
|---|---|
| `src/services/supabase.js` | DB 읽기/쓰기, 인증, 스토리지, 티어 조회 |
| `src/services/openai.js` | DeepSeek AI 호출 래퍼 |
| `src/services/kakaopay.js` | 카카오페이 결제 클라이언트 |
| `src/services/nicepayments.js` | NicePayments 카드 결제 클라이언트 |
| `src/services/document.js` | 서버 측 문서 변환 요청 |
| `src/services/aiCache.js` | IndexedDB 기반 AI 응답 캐시 |
| `src/hooks/useSupabaseAuth.js` | 인증 상태 관리 |
| `src/hooks/useUserTier.js` | free/pro/premium 티어 조회 |
| `src/hooks/useNiceSubscription.js` | NICE 구독 상태 관리 |
| `src/hooks/useCardPayment.js` | 카드 결제 흐름 |
| `src/hooks/usePageProgressCache.js` | 페이지 진행률 캐싱 |

---

## Supabase 테이블

| 테이블 | 용도 |
|---|---|
| `uploads` | 업로드 파일 메타데이터 |
| `artifacts` | 요약·퀴즈·OX 등 AI 생성 아티팩트 |
| `flashcards` | 플래시카드 |
| `mock_exams` | 모의고사 |
| `user_tiers` | 사용자 티어 (free/pro/premium) + 만료일 |
| `billing_subscriptions` | 결제 구독 정보 |
| `user_feedback` | 사용자 피드백 |
| `ocr_text_storage` | OCR 결과 캐시 (PDF 해시 기반) |

스토리지 버킷: `pdf-uploads` (기본값, `VITE_SUPABASE_BUCKET`으로 오버라이드 가능)

---

## 결제 시스템

### 카카오페이
- 일회성 결제 + 정기 구독 (`TCSUBSCRIP` CID)
- `api/kakaopay/ready.js` → `approve.js` → `subscription/` 흐름
- 환경변수: `KAKAOPAY_SECRET_KEY`, `KAKAOPAY_CID`, `KAKAOPAY_SUBSCRIPTION_CID`

### NicePayments (Postart REST 방식)
- 정기 구독: 카드 등록 → BID 발급 → `/v1/subscribe/{bid}/payments`
- 해지: `/v1/subscribe/{bid}/expire`
- `NICEPAYMENTS_BILLING_MID`, `NICEPAYMENTS_BILLING_MERCHANT_KEY`는 **더 이상 사용하지 않음**
- 필요 환경변수: `NICEPAYMENTS_CLIENT_ID`, `NICEPAYMENTS_SECRET_KEY`, `NICEPAYMENTS_SUBSCRIPTION_API_BASE`

---

## 티어 시스템

- `free` / `pro` / `premium` 세 단계
- `user_tiers` 테이블의 `tier_expires_at`으로 만료 관리
- 파일 업로드 크기 제한: `PDF_MAX_SIZE_BY_TIER` (`src/utils/appStateHelpers.js`)
- 프리미엄 프로필: 최대 `PREMIUM_PROFILE_LIMIT`개, 각자 독립적인 학습 공간

---

## 핵심 유틸리티 모듈

| 파일 | 역할 |
|---|---|
| `src/utils/appShared.js` | 스토리지 경로, 폴더 aggregate, 챕터 범위 키 생성 |
| `src/utils/appStateHelpers.js` | 티어 계산, 프리미엄 프로필, 퀴즈 정규화 |
| `src/utils/studyArtifacts.js` | partial summary 직렬화, mojibake 안전 텍스트 처리 |
| `src/utils/tutorHelpers.js` | AI 튜터 페이지/섹션 감지, 챕터 파싱 |
| `src/utils/pdf.js` | PDF.js 기반 텍스트 추출, OCR, 썸네일 생성 |
| `src/utils/document.js` | DOCX/PPTX 판별, 썸네일 생성 |
| `src/utils/evidenceMatcher.js` | AI 답변 증거 페이지 매핑 |
| `src/utils/imageOcr.js` | Tesseract.js OCR |
| `src/utils/pdfExport.js` | jsPDF로 PDF 내보내기 |

---

## 환경변수 요약

`.env.example` 참조. 핵심 변수:

```
# Supabase (supabase.env 또는 .env에 설정)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# AI
VITE_DEEPSEEK_API_KEY / DEEPSEEK_API_KEY
VITE_DEEPSEEK_BASE_URL            # 기본: https://api.deepseek.com
VITE_OPENAI_BASE_URL              # Vite 프록시 경로: /api/openai

# 앱 도메인
VITE_PUBLIC_APP_ORIGIN            # 프로덕션 HTTPS URL (결제 콜백 필수)

# 인증
VITE_AUTH_ENABLED                 # "true"/"false" — .env에서 덮어쓰기 불가, 빌드 환경변수만
VITE_NATIVE_APP_SCHEME            # com.tjwls.examstudyai

# Gotenberg (문서 변환)
GOTENBERG_BASE_URL

# Cron 인증
CRON_SECRET / KAKAOPAY_BILLING_CRON_SECRET / NICEPAYMENTS_BILLING_CRON_SECRET
```

---

## 빌드 & 개발

```bash
npm run dev                  # 웹 개발 서버 (Vite, 포트 5173)
npm run dev:mobile           # 모바일 빌드용 (0.0.0.0:3000)
npm run dev:kakaopay         # 카카오페이 로컬 서버 (포트 8787)
npm run dev:nicepayments     # NicePayments 로컬 서버 (포트 8791)
npm run dev:document         # 문서 변환 서버 (포트 8793)
npm run build                # 프로덕션 빌드 (배포 전 반드시 확인)
npm run android:run          # Android 앱 빌드 + 실행
```

---

## 주요 설계 결정 & 규칙

1. **App.jsx는 거대한 단일 파일이다.** 리팩토링 계획(README.md 참조)이 있지만 아직 미완. 수정 시 전체 상태 흐름을 파악해야 한다.

2. **모듈화 방침**: 파일 수를 최소화. 새 파일은 실제 기능 경계가 있을 때만 생성. 기존 도메인 모듈을 먼저 확장.

3. **OCR은 명시적 요청 시만 실행.** PDF 열기·미리보기 단계에서는 OCR 금지. 요약·튜터·챕터 범위 요청 시에만 실행.

4. **퀴즈 구조**: OX → 객관식 → 주관식 순서로 렌더링. 퀴즈 믹스는 총 7문제(OX/객관식/주관식 비율).

5. **AI 증거 페이지**: 챕터 범위 선택 시 AI가 반환하는 증거 페이지를 해당 챕터 범위로 제한. 전체 문서와 혼합 금지.

6. **인증 토글**: `VITE_AUTH_ENABLED`는 Vercel 빌드 환경변수로만 제어. `.env` 파일에서 덮어쓰기 불가.

7. **DeepSeek 프록시**: 코드에서 `openai`라는 이름이 남아 있어도 실제로는 DeepSeek API를 호출한다.

8. **Native Android**: Capacitor 기반. OAuth 콜백은 딥 링크 `com.tjwls.examstudyai://auth/callback` 사용. 결제 콜백은 절대 HTTPS URL 필요.

---

## 자주 혼동되는 부분

- `api/openai/` = DeepSeek 프록시 (OpenAI 호환 API)
- `NICEPAYMENTS_BILLING_MID` = 구버전 변수, 현재 미사용
- `supabase.env` = Supabase 전용 환경변수 파일 (`.env`의 폴백)
- `FOLDER_AGGREGATE_DOC_PREFIX = "folder::"` = 폴더 전체 학습 문서의 가상 ID 접두사
- `ocr_text_storage` 테이블 = OCR 결과를 PDF 해시로 캐싱 (반복 OCR 방지)

---

## 관련 파일 더 읽기

- [README.md](README.md) — 전체 아키텍처 + 리팩토링 로드맵
- [CLIENT_UPDATE_GUIDE.md](CLIENT_UPDATE_GUIDE.md) — 클라이언트 배포 가이드
- [.env.example](.env.example) — 환경변수 전체 목록
- [database/](database/) — Supabase 테이블 스키마 SQL
- [src/App.jsx](src/App.jsx) — 핵심 상태 관리 진입점
- [src/services/supabase.js](src/services/supabase.js) — DB/Auth 서비스
- [src/utils/appStateHelpers.js](src/utils/appStateHelpers.js) — 티어·프로필 헬퍼
