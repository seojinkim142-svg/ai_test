# Zeusian.ai

Zeusian.ai is an AI-powered PDF study assistant built with React + Vite. The app supports document upload, summary generation, quiz/OX/mock-exam creation, flashcards, AI tutor interactions, premium profile spaces, and folder-level combined study documents.

## Branding

Use `Zeusian.ai` as the primary product name in UI copy, SEO metadata, and documentation. Keep `Zeusian` only where a legacy identifier or an external integration explicitly requires it.

## Recent Changes

Recent app changes that are already reflected in the current codebase:

- OCR pipeline optimization
  - Reused PDF document handles and Tesseract workers.
  - Added OCR result caching and throttled OCR progress updates.
  - Reduced OCR render cost with page-order sampling and pixel caps.
- PDF open flow improvement
  - Tapping a document now enters the detail screen immediately.
  - Remote file fetch now continues in the background while the detail page shows an opening/loading state.
- Native social login redirect fix
  - Android/Capacitor login flows now return through the app callback instead of `localhost`.
  - Supabase auth callback exchange is handled through the native deep link flow.
- Quiz structure update
  - OX questions were merged into the main quiz flow.
  - Quiz mixes now support `OX / 객관식 / 주관식` ratios with a fixed total of 7 questions.
  - Quiz rendering order is now `OX -> 객관식 -> 주관식`.
- PDF preview stability fix
  - Prevented overlapping PDF.js canvas renders that caused native tablet preview failures.
- Frontend bundle optimization
  - Split large runtime chunks in Vite for React, Supabase, markdown, PDF, jsPDF, and html2canvas.
  - Moved large helper logic out of `src/App.jsx` into consolidated utility modules without excessive file fragmentation.
- Encoding recovery
  - Restored major mojibake/broken Korean UI strings in quiz and detail screen components.
- Quiz generation OCR behavior change
  - Quiz, OX, and mock-exam generation no longer trigger fresh OCR during question generation.
  - These features now prefer extracted text, cached summary source text, and chapter text cached during summary generation.
- Chapter-scoped question generation fix
  - Quiz, OX, and mock-exam generation now clamp AI-provided evidence pages to the selected chapter range for PDF sources.
  - Chapter-selected generation no longer mixes tagged chapter pages with fallback whole-document context.

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

## Build Verification

Use this before deploying:

```bash
npm run build
```

The current refactor was verified with a successful production build.

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
  - The default summary view is the paged card layout.
  - `크게 보기` is intentionally shown only on phones and hidden on web/tablet.

- PDF preview in APK / native runtime:
  - Native builds use the PDF.js canvas renderer in `src/components/PdfPreview.jsx`.
  - Phone navigation supports previous/next buttons, page jump, and swipe/wheel-assisted page movement.
  - A render-request guard is applied so moving to the next page does not redraw the previous page over the new one.

- Desktop / tablet expectations:
  - Header and detail tabs follow the desktop/tablet layout.
  - The current phone-specific styling should not be treated as the default web layout.

Key files related to current phone behavior:

- `src/index.css`
- `src/components/FileUpload.jsx`
- `src/components/Header.jsx`
- `src/components/PdfPreview.jsx`
- `src/components/SummaryCard.jsx`
- `src/pages/DetailPage.jsx`

## Auth Toggle

Use `VITE_AUTH_ENABLED` to switch login/auth UI on or off.

```bash
# disable auth (default)
VITE_AUTH_ENABLED=false

# enable auth
VITE_AUTH_ENABLED=true
```

- Team-shared default (committed to Git): change `AUTH_DEFAULT_ENABLED` in `src/config/auth.js`.
- `VITE_AUTH_ENABLED` is read only from the build environment variable.
- In this project, `.env` / `supabase.env` values for `VITE_AUTH_ENABLED` are intentionally ignored.

### Vercel

Set this in **Project Settings -> Environment Variables**:

```bash
VITE_AUTH_ENABLED=true
```

or

```bash
VITE_AUTH_ENABLED=false
```

Important:
- `VITE_AUTH_ENABLED` is a **build-time** variable in Vite.
- After changing it in Vercel, you must **redeploy** for the change to take effect.
- Set it for the correct target (`Production` / `Preview` / `Development`) in Vercel.

## Vercel Function Limit

This project is kept compatible with the Vercel Hobby plan's **12 Serverless Functions per deployment** limit.

- Only real HTTP entrypoints should live under `api/`.
- Shared server logic must live under `lib/`, not `api/`.
- Subscription endpoints are consolidated behind dynamic route files so the public URLs stay the same while the function count stays low.

Current server entrypoints under `api/`:

- `/api/kakaopay/ready`
- `/api/kakaopay/approve`
- `/api/kakaopay/subscription/[action]`
- `/api/nicepayments/config`
- `/api/nicepayments/confirm`
- `/api/nicepayments/return`
- `/api/nicepayments/subscription/[action]`
- `/api/openai/v1/chat/completions`

Notes:

- `api/kakaopay/subscription/[action].js` handles `status`, `charge`, and `inactive`.
- `api/nicepayments/subscription/[action].js` handles `prepare`, `return`, `status`, `charge`, and `inactive`.
- If you add new server code, prefer extending an existing grouped route or adding shared code in `lib/` before creating a new file under `api/`.

## Start Flow

The app now uses different first-entry behavior for web and APK builds when auth is enabled.

- Web:
  - Opens the intro/start page first.
  - Login opens only after the user presses the start/login action, or when `/?auth=1` is used.
- Android APK (Capacitor):
  - Opens the login screen first on app launch.
  - The intro/start page is not shown before login.

Current implementation notes:
- Path-based promo pages (`/start`, `/intro`, `/landing`) still render the intro-only page on the web.
- Native app login-first behavior is handled in `src/App.jsx`.

## Tier Expiry (Pro/Premium)

Paid tiers are now time-bound using `user_tiers.tier_expires_at`.

1. Run SQL once in Supabase SQL Editor:

```sql
-- file: database/user_tiers_expiry.sql
```

2. Configure server env vars (Vercel Project Settings -> Environment Variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_USER_TIER_TABLE` (optional, default: `user_tiers`)

3. App behavior:
- `setUserTier({ userId, tier: "pro" | "premium" })` sets expiry to +1 month.
- If the user already has the same paid tier and it is still active, the next payment extends from the current expiry (not from now).
- `getUserTierStatus({ userId })` returns:
  - `tier`
  - `tierExpiresAt`
  - `tierRemainingDays`
- If expiry is passed, user is downgraded to `free` automatically on read.
- Payment approval endpoints (`/api/kakaopay/approve`, `/api/nicepayments/confirm`) now update tier server-side after payment verification.

4. Optional overrides:
- `setUserTier({ ..., expiresAt })` to set an exact expiry timestamp.
- `setUserTier({ ..., extendMonths })` to use a custom extension term.

## KakaoPay Secret Key Setup

Use **Secret key** from Supabase/Vercel-style server env, never in client code.

1. KakaoPay Developers -> ??-> API ?ㅼ뿉??Admin/Secret key ?뺤씤
2. Server env (Vercel Environment Variables) ?ㅼ젙:
   - `KAKAOPAY_SECRET_KEY`
   - `KAKAOPAY_CID`
3. 諛고룷/?쒕쾭 ?ъ떆????寃곗젣 以鍮?API(`/api/kakaopay/ready`) ?몄텧 ?뺤씤

Notes:
- `VITE_` ?묐몢?щ줈 ?ｌ쑝硫?釉뚮씪?곗????몄텧?⑸땲?? 鍮꾨??ㅻ뒗 `VITE_` ?놁씠 ?쒕쾭 ?꾩슜?쇰줈 ?ｌ뼱???⑸땲??

## PDF Page Controls (Native Only)

- The custom Prev / Next / Move controls are shown only in native apps (Android/iOS, Capacitor).
- On the web, custom controls are hidden and the browser's built-in PDF viewer behavior is used.
