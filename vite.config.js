/* global process */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "path";

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const supabaseEnvPath = path.resolve(root, "supabase.env");

  // supabase.env 값을 process.env에 주입 (존재하지 않아도 무시)
  dotenv.config({ path: supabaseEnvPath });

  // Vite의 import.meta.env를 강제 로드해 환경변수 노출 범위 제어
  loadEnv(mode, root, "");

  return {
    plugins: [
      // JSX가 React 자동 런타임으로 변환되도록 명시
      react({ jsxRuntime: "automatic" }),
    ],
    esbuild: {
      jsx: "automatic",
    },
    server: {
      proxy: {
        // 브라우저 → Vite dev 서버(동일 origin) → OpenAI로 우회해 CORS 차단 해소
        "/api/openai": {
          target: "https://api.openai.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/openai/, ""),
        },
      },
    },
  };
});
