import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "path";

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const supabaseEnvPath = path.resolve(root, "supabase.env");

  // supabase.env 값을 process.env에 주입 (존재하지 않아도 무시)
  dotenv.config({ path: supabaseEnvPath });

  // Vite가 import.meta.env에 주입할 값을 읽어오기 위해 모든 프리픽스를 허용
  loadEnv(mode, root, "");

  return {
    plugins: [react()],
  };
});
