/* global process */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

function normalizeChunkId(id) {
  return String(id || "").replace(/\\/g, "/");
}

function createManualChunks(id) {
  const normalizedId = normalizeChunkId(id);
  if (!normalizedId.includes("/node_modules/")) return null;

  if (normalizedId.includes("/pdfjs-dist/") || normalizedId.includes("/tesseract.js/")) {
    return "pdf-runtime";
  }

  if (normalizedId.includes("/jspdf/")) {
    return "jspdf-runtime";
  }

  if (normalizedId.includes("/html2canvas/")) {
    return "html2canvas-runtime";
  }

  if (
    normalizedId.includes("/react-markdown/") ||
    normalizedId.includes("/remark-gfm/") ||
    normalizedId.includes("/remark-math/") ||
    normalizedId.includes("/rehype-katex/") ||
    normalizedId.includes("/rehype-mathjax/") ||
    normalizedId.includes("/react-katex/") ||
    normalizedId.includes("/katex/")
  ) {
    return "markdown-runtime";
  }

  if (normalizedId.includes("/@supabase/")) {
    return "supabase-runtime";
  }

  if (
    normalizedId.includes("/@capacitor/") ||
    normalizedId.includes("/@capacitor-community/")
  ) {
    return "capacitor-runtime";
  }

  if (
    normalizedId.includes("/react/") ||
    normalizedId.includes("/react-dom/") ||
    normalizedId.includes("/scheduler/")
  ) {
    return "react-runtime";
  }

  return "vendor";
}

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const supabaseEnvPath = path.resolve(root, "supabase.env");

  // Priority:
  // 1) Already defined env (e.g. Vercel Project Environment Variables)
  // 2) .env/.env.[mode]
  // 3) supabase.env fallback
  const modeEnv = loadEnv(mode, root, "");
  for (const [key, value] of Object.entries(modeEnv)) {
    if (key === "VITE_AUTH_ENABLED") continue;
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

  // Auth toggle is controlled only by build environment variables
  // (e.g. Vercel Project Settings -> Environment Variables).
  const authEnabledFromBuildEnv =
    process.env.VITE_AUTH_ENABLED == null ? "" : String(process.env.VITE_AUTH_ENABLED);
  const adSensePublisherId =
    process.env.VITE_ADSENSE_PUBLISHER_ID == null ? "" : String(process.env.VITE_ADSENSE_PUBLISHER_ID).trim();
  const hasValidAdSensePublisherId = /^ca-pub-\d{16}$/.test(adSensePublisherId);

  const adSenseHtmlPlugin = {
    name: "inject-adsense-auto-ads",
    transformIndexHtml(html) {
      if (!hasValidAdSensePublisherId) return html;

      return {
        html,
        tags: [
          {
            tag: "meta",
            injectTo: "head",
            attrs: {
              name: "google-adsense-account",
              content: adSensePublisherId,
            },
          },
          {
            tag: "script",
            injectTo: "head",
            attrs: {
              async: true,
              src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSensePublisherId}`,
              crossorigin: "anonymous",
            },
          },
        ],
      };
    },
  };

  return {
    define: {
      __APP_AUTH_ENABLED__: JSON.stringify(authEnabledFromBuildEnv),
    },
    plugins: [react({ jsxRuntime: "automatic" }), adSenseHtmlPlugin],
    esbuild: {
      jsx: "automatic",
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: createManualChunks,
        },
      },
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
        "/api/feedback": {
          target: "http://localhost:8792",
          changeOrigin: true,
        },
      },
    },
  };
});
