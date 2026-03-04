/* global process */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const supabaseEnvPath = path.resolve(root, "supabase.env");

  // Priority:
  // 1) Already defined env (e.g. Vercel Project Environment Variables)
  // 2) .env/.env.[mode]
  // 3) supabase.env fallback
  const modeEnv = loadEnv(mode, root, "");
  for (const [key, value] of Object.entries(modeEnv)) {
    if (process.env[key] == null && typeof value === "string") {
      process.env[key] = value;
    }
  }

  // Use supabase.env as fallback only when a key is still missing.
  if (fs.existsSync(supabaseEnvPath)) {
    const parsedSupabaseEnv = dotenv.parse(fs.readFileSync(supabaseEnvPath));
    for (const [key, value] of Object.entries(parsedSupabaseEnv)) {
      if (key === "VITE_AUTH_ENABLED") continue;
      if (process.env[key] == null) process.env[key] = value;
    }
  }

  return {
    plugins: [react({ jsxRuntime: "automatic" })],
    esbuild: {
      jsx: "automatic",
    },
    server: {
      proxy: {
        "/api/openai": {
          target: "https://api.openai.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/openai/, ""),
        },
        "/api/kakaopay": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
        "/api/nicepayments": {
          target: "http://localhost:8791",
          changeOrigin: true,
        },
      },
    },
  };
});
