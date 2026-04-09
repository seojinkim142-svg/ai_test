# Zeusian.ai

Zeusian.ai is an AI-powered PDF study assistant built with React + Vite. The app supports document upload, summary generation, quiz/OX/mock-exam creation, flashcards, AI tutor interactions, premium profile spaces, and folder-level combined study documents.

## Branding

Use `Zeusian.ai` as the primary product name in UI copy, SEO metadata, and documentation. Keep `Zeusian` only where a legacy identifier or an external integration explicitly requires it.

## Planned Code Improvements (App.jsx Refactoring)

Based on recent code review of `src/App.jsx`, the following improvements are planned to enhance maintainability, performance, and code quality:

### 1. Code Structure Optimization

**Problem Identified:**
- App.jsx is a massive single file (~2,500+ lines) containing all application logic
- 30+ utility functions defined outside the component
- Complex state management with 50+ useState hooks and 10+ useRef hooks

**Improvement Plan:**

**Priority 1: Utility Function Separation**
- Move `buildStoragePathCandidates` ~ `writePartialSummaryBundleToHighlights` functions to separate files
- Group related functions by feature:
  - `src/utils/tutorHelpers.js` (already exists)
  - `src/utils/chapterRangeHelpers.js`
  - `src/utils/fileHelpers.js`
  - `src/utils/summaryHelpers.js`

**Priority 2: Custom Hook Extraction**
- File upload and management logic → `useFileManagement`
- Quiz state management → `useQuizState`
- Tutor chat → `useTutorChat`
- Premium profile → `usePremiumProfile`

**Priority 3: Component Splitting**
- Auth-related UI and logic → `AuthContainer` component
- File list and selection logic → `FileManager` component
- Settings and profile management → `ProfileManager` component

### 2. Performance Optimization

**Performance Issues:**
- Excessive use of `useMemo`/`useCallback` may cause performance degradation
- Potential unnecessary re-renders
- Memory leak risks from improperly cleaned up refs and event listeners

**Optimization Strategies:**
1. **Remove unnecessary useMemo/useCallback**
   - Profile with React DevTools to identify actual performance bottlenecks
   - Keep only those that provide measurable performance benefits

2. **Event listener optimization**
   - Remove duplicate event listeners
   - Ensure proper cleanup in useEffect dependencies

3. **Memory leak prevention**
   - Proper initialization and cleanup of ref objects
   - Implement async task cancellation mechanisms

### 3. Code Quality Enhancements

**Type Safety:**
- Consider TypeScript migration for better type safety
- Add PropTypes or JSDoc comments for critical functions

**Testability:**
- Extract pure functions for easier unit testing
- Add comprehensive test coverage

**Error Handling:**
- Implement consistent error handling patterns
- Add user-friendly error messages with recovery options

### 4. Implementation Roadmap

**Phase 1 (Immediate):**
1. Create utility function files and move related functions
2. Extract 2-3 most critical custom hooks
3. Add basic TypeScript interfaces for core data structures

**Phase 2 (Short-term):**
1. Split App.jsx into 3-4 logical components
2. Implement comprehensive error boundaries
3. Add performance monitoring for critical paths

**Phase 3 (Medium-term):**
1. Consider lightweight state management (Zustand/Jotai)
2. Optimize bundle splitting further
3. Implement comprehensive testing suite

### 5. Expected Benefits

- **Maintainability**: Easier to locate and modify specific features
- **Performance**: Reduced bundle size and optimized re-renders
- **Developer Experience**: Better code organization and debugging
- **Scalability**: Foundation for adding new features without bloating App.jsx

## Recent Changes

Recent app changes that are already reflected in the current codebase:

### 성능 최적화 및 사용자 경험 개선

**PDF 처리 최적화**
- PDF.js 워커 재사용 및 메모리 관리 개선
- 페이지별 렌더링 우선순위 설정 (사용자 뷰포트 기반)
- 이미지 압축 및 캐싱 시스템 구현
- OCR 파이프라인 최적화
  - PDF 문서 핸들 및 Tesseract 워커 재사용
  - OCR 결과 캐싱 및 진행률 업데이트 제한
  - 페이지 순서 샘플링 및 픽셀 제한으로 OCR 렌더링 비용 감소

**AI 응답 캐싱 시스템**
- OpenAI API 응답 캐싱 (IndexedDB 기반)
- 캐시 만료 정책 및 자동 재검증
- 오프라인 모드 지원
- 캐시 히트율 모니터링 및 통계

**번들 사이즈 최적화**
- Vite 코드 스플리팅 전략 개선
- React, Supabase, PDF.js 등 대용량 라이브러리 청크 분리
- 트리 쉐이킹 및 데드 코드 제거
- 동적 임포트를 통한 지연 로딩

**오프라인 지원 강화**
- Service Worker를 통한 정적 자원 캐싱
- IndexedDB 기반 데이터 저장소
- 네트워크 상태 감지 및 오프라인 UI
- 백그라운드 동기화 기능

**접근성 개선**
- WCAG 2.1 AA 기준 준수
- 키보드 네비게이션 지원
- 스크린 리더 호환성 개선
- 고대비 모드 및 모션 감소 지원

**모바일 UX 최적화**
- 터치 제스처 최적화
- 모바일 전용 UI 컴포넌트
- 배터리 효율성 개선
- 네트워크 대역폭 최적화

**로딩 상태 개선**
- 스켈레톤 UI 및 점진적 로딩
- 낙관적 업데이트 패턴
- 진행률 표시기 및 에러 상태 관리
- 사용자 피드백 개선

### 기술 인프라 개선

**테스트 시스템**
- Jest 기반 단위 테스트 설정
- React Testing Library 통합
- 성능 테스트 및 E2E 테스트 준비
- 코드 커버리지 리포트

**모니터링 시스템**
- 성능 메트릭 모니터링 (Web Vitals)
- 에러 추적 및 로깅 시스템
- 사용자 행동 분석
- 실시간 알림 및 경고

**보안 강화**
- XSS 방어 및 입력 검증
- CSRF 보호 강화
- API 요청 제한 및 속도 제한
- 데이터 암호화 및 개인정보 보호

### 사용자 경험 개선

**PDF 열기 흐름 개선**
- 문서 탭 시 즉시 상세 화면 진입
- 원격 파일 가져오기는 백그라운드에서 계속 진행
- 로딩 상태 표시 개선

**네이티브 소셜 로그인 리디렉션 수정**
- Android/Capacitor 로그인 흐름이 앱 콜백을 통해 반환
- Supabase 인증 콜백 교환은 네이티브 딥 링크 흐름 처리

**퀴즈 구조 업데이트**
- OX 질문이 메인 퀴즈 흐름에 통합
- 퀴즈 믹스는 `OX / 객관식 / 주관식` 비율 지원 (총 7문제)
- 퀴즈 렌더링 순서: `OX -> 객관식 -> 주관식`

**PDF 미리보기 안정성 수정**
- 네이티브 태블릿 미리보기 실패를 유발하는 중복 PDF.js 캔버스 렌더링 방지

**인코딩 복구**
- 퀴즈 및 상세 화면 컴포넌트의 주요 깨진 한국어 UI 문자열 복원

**퀴즈 생성 OCR 동작 변경**
- 퀴즈, OX, 모의고사 생성 시 새로운 OCR 트리거하지 않음
- 추출된 텍스트, 캐시된 요약 소스 텍스트, 요약 생성 중 캐시된 챕터 텍스트 우선 사용

**챕터 범위 질문 생성 수정**
- 퀴즈, OX, 모의고사 생성 시 AI 제공 증거 페이지를 선택된 챕터 범위로 제한
- 챕터 선택 생성이 태그된 챕터 페이지와 폴백 전체 문서 컨텍스트를 혼합하지 않음

### Latest PDF Opening Behavior

- Clicking a PDF now enters the detail screen immediately.
- An opening placeholder is shown first while the app prepares the document preview and extracted text.
- The placeholder stays visible during the initial open flow instead of appearing only briefly after loading has already started.
- Preview-time OCR remains disabled. OCR is reserved for flows that explicitly need it, such as page-range summaries or tutor features.

## Modularization And Deployment Notes

This project is modularized with Vercel deployment constraints in mind.

- Do not split everything into many tiny files.
- Prefer a small number of domain-based utility modules over one-function-per-file.
- Keep heavy UI boundaries lazy-loaded where they already map to real screens or overlays.
- Reuse shared helpers across features instead of duplicating logic in components.

### Current low-file-count modularization strategy

The latest refactor intentionally moved large pure-helper blocks out of `src/App.jsx` into only a few consolidated modules:

- `src/utils/appShared.js`
  - shared app/document helpers
  - folder aggregate document helpers
  - local ID generation
  - chapter-range storage key generation
- `src/utils/studyArtifacts.js`
  - partial summary serialization
  - mojibake-safe UI text sanitation
- `src/utils/tutorHelpers.js`
  - tutor page/section detection
  - tutor fallback answer handling
  - chapter number selection parsing

This keeps the codebase more maintainable without creating an excessive number of files that could bloat deployment packaging.

### Practical rule for future refactors

If you want to modularize more:

1. First extend an existing domain module.
2. Create a new file only when the logic represents a real feature boundary.
3. Avoid micro-modules that add file count but do not create a meaningful lazy-load or ownership boundary.

## Latest Product Updates

Recent app updates now reflected in the codebase:

- Kakao / Supabase OAuth callback handling was hardened for both web and native Android flows.
  - Web redirect resolution now prefers the current local dev origin when appropriate.
  - Native Android callback handling now preserves OAuth query parameters so session exchange is not dropped on app return.
- A Chrome extension was added under `chrome-extension/`.
  - Supports selected-text capture, page snapshot capture, local clip history, context-menu save actions, and quick launch into Zeusian.ai.
  - Popup styling was simplified to match the current Zeusian visual direction and decorative helper labels were removed.
- Decorative helper labels were removed across key web/app surfaces to keep the UI cleaner and more direct.
- DOCX and PPTX uploads can now be normalized into server-generated PDF previews.
  - The original Office file remains stored as uploaded.
  - A generated preview PDF is stored separately and used by the detail preview pipeline.
  - Upload cards now refresh their thumbnail from the generated preview PDF so Office uploads visually behave more like PDFs after conversion.
- NICE recurring billing was migrated from the legacy MID/goPay billing-auth popup flow to the NicePayments Postart REST bill-key flow.
  - Registration now uses encrypted card data with `POST /v1/subscribe/regist`.
  - First recurring payment uses the issued `BID` with `POST /v1/subscribe/{bid}/payments`.
  - Cancellation expires the `BID` with `POST /v1/subscribe/{bid}/expire`.
  - Existing subscription persistence, tier sync, and cron-based follow-up charging remain in place.

### NicePayments Recurring Billing

The current recurring card implementation assumes the NicePayments Postart contract model:

- `client key + secret key`
- REST bill-key APIs
- No `goPay` popup or MID-based billing-auth return flow for recurring registration

Recommended recurring billing environment values:

- `NICEPAYMENTS_CLIENT_ID`
- `NICEPAYMENTS_SECRET_KEY`
- `NICEPAYMENTS_SUBSCRIPTION_API_BASE=https://api.nicepay.co.kr`
- `NICEPAYMENTS_BILLING_CRON_SECRET`

Legacy recurring billing variables such as `NICEPAYMENTS_BILLING_MID` and `NICEPAYMENTS_BILLING_MERCHANT_KEY` are no longer used by the recurring subscription endpoints.

## Build Verification

Use this before deploying:

```bash
npm run build
```

The current refactor was verified with a successful production build.

## Office Preview PDF Conversion

DOCX and PPTX uploads can now be normalized into server-generated PDF previews so the app preview path stays consistent with PDF documents.

- The original file is still uploaded to Supabase Storage.
- A server endpoint at `/api/document/convert` downloads the original file, sends it to a Gotenberg-compatible LibreOffice converter, uploads the generated PDF preview back to Supabase Storage, and stores its path on the `uploads` row.
- The detail preview prefers the generated PDF when `preview_pdf_path` is available. If an older upload does not have a preview yet, opening it triggers a best-effort backfill conversion.

Required setup:

1. Run [database/uploads_preview_pdf.sql](/c:/Users/tjwls/OneDrive/시험공부ai/database/uploads_preview_pdf.sql) on Supabase.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server.
3. Set `GOTENBERG_BASE_URL` to a reachable Gotenberg host.
4. In local development, run `npm run dev:document` alongside `vite` if you want `/api/document` conversion through the local proxy.
5. The migration file to run is `database/uploads_preview_pdf.sql`.
6. For local browser testing, set `DOCUMENT_ALLOW_ORIGIN=http://localhost:5173` and keep `GOTENBERG_BASE_URL=http://localhost:3000` when Gotenberg runs on the same machine.

## Vite / React Notes

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Mobile App (Capacitor)

This project is configured to run as an Android app using Capacitor while keeping the existing React/Vite codebase.

1. Build web assets:

```bash
npm run build:mobile
```

2. Sync web assets to Android:

```bash
npm run cap:sync
```

3. Open Android Studio:

```bash
npm run cap:open:android
```

Useful shortcuts:

```bash
# build + sync + open Android Studio
npm run android:open

# build + sync + run on connected device/emulator
npm run android:run
```

### iOS (Capacitor + Xcode)

iOS builds require macOS and Xcode. You can prepare the project from this repo, but the final app build/archive must be done on a Mac.

1. Install the iOS platform package once:

```bash
npm install @capacitor/ios
```

2. Add the iOS platform once:

```bash
npm run cap:add:ios
```

3. Build, sync, and open Xcode:

```bash
npm run ios:open
```

Useful shortcuts:

```bash
# open the iOS project in Xcode after rebuilding web assets
npm run ios:open

# build + sync + run on the selected iOS simulator/device from Xcode tooling
npm run ios:run
```

After opening Xcode:

1. Select your Apple Team in Signing & Capabilities.
2. Confirm the bundle identifier matches your Apple setup.
3. Run on a simulator/device, or use Product > Archive for TestFlight/App Store builds.

### iOS Environment Checklist

For iOS, these values should all point at the same public HTTPS app domain, not `localhost`:

- `VITE_PUBLIC_APP_ORIGIN`
- `VITE_SUPABASE_REDIRECT_URL`
- `KAKAOPAY_CLIENT_ORIGIN`
- `KAKAOPAY_ALLOW_ORIGIN`
- `NICEPAYMENTS_CLIENT_ORIGIN`
- `VITE_NICEPAYMENTS_RETURN_URL`

Notes:

- Supabase OAuth redirect allowlists must include the same HTTPS redirect URL you build into the app.
- KakaoPay production approval/cancel/fail URLs cannot use `localhost`.
- NICE Payments return URLs should resolve back to the same deployed HTTPS origin that serves `/api/nicepayments/return`.

## Advertising

The project currently uses two separate ad paths:

- Android app: `AdMob`
- Website: `AdSense Auto ads`

### Android App Ads (AdMob)

Android native ads are integrated with `@capacitor-community/admob`.

- Current format: bottom banner only
- Current targeting: free tier users only
- Current runtime: Android native app only
- Hidden on auth and payment overlays

Relevant files:

- `src/services/admob.js`
- `src/hooks/useAdMobBanner.js`
- `src/App.jsx`
- `android/app/build.gradle`
- `android/app/src/main/AndroidManifest.xml`

Required values:

- `ADMOB_APP_ID`
  - Set in `android/gradle.properties` or environment
- `VITE_ADMOB_BANNER_ID_ANDROID`
  - Set in `.env.production` or build environment
- `VITE_ADMOB_TEST_DEVICE_IDS`
  - Optional, comma-separated test device IDs for AdMob debugging

Notes:

- If `VITE_ADMOB_BANNER_ID_ANDROID` is empty, the app falls back to Google's test banner unit.
- The Android build injects `admob_app_id` through Gradle `resValue`.
- After changing app ad settings, rebuild and sync Android:

```bash
npm run build
npm run cap:sync android
cd android
.\gradlew.bat assembleDebug
```

### Web Ads (AdSense Auto Ads)

The website uses AdSense Auto ads instead of AdMob.

- The AdSense script is injected into `index.html` at build time from `vite.config.js`
- The site publisher ID is read from `VITE_ADSENSE_PUBLISHER_ID`
- `ads.txt` is served from `public/ads.txt`

Relevant files:

- `vite.config.js`
- `.env.production`
- `public/ads.txt`

Required value:

- `VITE_ADSENSE_PUBLISHER_ID`
  - Example format: `ca-pub-xxxxxxxxxxxxxxxx`

Verification checklist:

1. Deploy the latest web build.
2. Confirm page source includes the AdSense script in `<head>`.
3. Confirm `https://your-domain/ads.txt` is reachable.
4. Complete site review and CMP setup in AdSense.

Notes:

- Auto ads may not display immediately after code insertion.
- Actual ad serving depends on AdSense site review and policy approval.
- For EEA/UK/Switzerland traffic, a Google-certified CMP should remain enabled.

## iPhone PWA (No Mac Required)

If you do not have a Mac, the most practical iPhone path is to ship the web app as a PWA and install it from Safari.

Current project support:

- `manifest.webmanifest`
- `service-worker.js`
- iPhone home screen metadata in `index.html`

How to use it on iPhone:

1. Deploy the site over HTTPS.
2. Open the site in Safari on iPhone.
3. Tap Share.
4. Tap Add to Home Screen.
5. If shown, enable Open as Web App.

Notes:

- This gives an app-like fullscreen launch experience without Xcode.
- Login/payment redirects should still use the same public HTTPS domain configured in `.env`.
- This is not an App Store binary and does not produce an `.ipa`.

### Android Live Reload (instant updates on device)

Use this during UI/logic development so changes are reflected immediately without rebuilding `dist`.

1. Start Vite dev server (Terminal 1):

```bash
npm run dev:mobile
```

2. Run Capacitor app in live-reload mode (Terminal 2):

```bash
# generic connected device/emulator
npm run android:live

# your current tablet target
npm run android:live:target
```

After this, saving code in `src/` should update the app on the tablet right away.

## Current Mobile Phone UI Notes

Current phone-specific behavior is mainly defined for screens narrower than `640px` (`sm` breakpoint).

- Phone-only responsive rules:
  - `.mobile-chip-row`, `.mobile-tab-row`, `.mobile-card-rail` use horizontal scrolling under `@media (max-width: 639px)` in `src/index.css`.
  - Tablet and desktop keep the regular `sm`/`md`/`lg` layouts unless a component explicitly uses native-device detection.

- Upload / library screen:
  - The top action area is compacted for phones.
  - Upload tiles and document tiles use a tighter phone layout with a 2-column grid in the main upload area.

- Detail screen:
  - On phones, a compact document info card is shown above the PDF preview.
  - Phone-only previous/next page buttons are shown in that document info card.
  - The `요약 / 퀴즈 / OX / 모의고사 / 카드 / AI 튜터` row becomes a horizontally scrollable tab row on phones.
  - Phone detail content uses normal page scrolling; tablet/desktop keep the inner panel scroll layout.

- Summary UI:
  - The default summary view is the paged
