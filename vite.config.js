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

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export default defineConfig(async ({ mode }) => {
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
  const deepSeekProxyTarget =
    trimTrailingSlash(process.env.VITE_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_UPSTREAM_BASE_URL) ||
    "https://api.deepseek.com";
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

  // 번들 분석 플러그인 (개발 모드에서만)
  let bundleAnalyzerPlugin = null;
  if (mode === 'analyze') {
    const { default: visualizer } = await import('rollup-plugin-visualizer');
    bundleAnalyzerPlugin = visualizer({
      filename: './dist/bundle-analysis.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    });
  }

  return {
    define: {
      __APP_AUTH_ENABLED__: JSON.stringify(authEnabledFromBuildEnv),
      __APP_MODE__: JSON.stringify(mode),
    },
    plugins: [
      react({ 
        jsxRuntime: "automatic",
        babel: {
          plugins: [
            // 코드 스플리팅을 위한 동적 임포트 변환
            ['babel-plugin-transform-imports', {
              'lodash': {
                transform: 'lodash/${member}',
                preventFullImport: true
              }
            }]
          ]
        }
      }), 
      adSenseHtmlPlugin,
      ...(bundleAnalyzerPlugin ? [bundleAnalyzerPlugin] : [])
    ],
    esbuild: {
      jsx: "automatic",
      // 트리 쉐이킹 최적화
      treeShaking: true,
      // 데드 코드 제거
      minifyIdentifiers: mode === 'production',
      minifySyntax: mode === 'production',
      minifyWhitespace: mode === 'production',
    },
    build: {
      // 소스맵 설정
      sourcemap: mode === 'development' ? 'inline' : false,
      // 청크 크기 경고 임계값
      chunkSizeWarningLimit: 1000, // 1MB
      // 빌드 출력 디렉토리
      outDir: 'dist',
      // 빈 디렉토리 정리
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: createManualChunks,
          // 청크 파일명 포맷
          chunkFileNames: mode === 'production' 
            ? 'assets/[name]-[hash].js' 
            : 'assets/[name].js',
          entryFileNames: mode === 'production'
            ? 'assets/[name]-[hash].js'
            : 'assets/[name].js',
          assetFileNames: mode === 'production'
            ? 'assets/[name]-[hash].[ext]'
            : 'assets/[name].[ext]',
          // 코드 스플리팅 최적화
          experimentalMinChunkSize: 10000, // 10KB
        },
        // 외부 의존성 제외 (CDN에서 로드)
        external: [],
      },
      // 최소 청크 크기
      minify: mode === 'production' ? 'terser' : false,
      terserOptions: mode === 'production' ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      } : {},
    },
    server: {
      proxy: {
        "/api/openai": {
          target: deepSeekProxyTarget,
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
    // 개발 서버 최적화
    preview: {
      port: 4173,
      strictPort: true,
    },
    // 캐싱 설정
    cacheDir: './node_modules/.vite',
    // CSS 최적화
    css: {
      devSourcemap: mode === 'development',
      modules: {
        localsConvention: 'camelCase',
      },
    },
    // 동적 임포트 최적화
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@capacitor/core',
        '@supabase/supabase-js',
      ],
      exclude: [
        'pdfjs-dist',
        'tesseract.js',
      ],
      // 강제 사전 번들링
      force: mode === 'development',
    },
    // 환경 변수 노출
    envPrefix: ['VITE_', 'APP_'],
  };
});
