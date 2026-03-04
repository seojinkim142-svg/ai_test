# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

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
