import { createClient } from "@supabase/supabase-js";
import { readdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const SUPABASE_URL = "https://abafcnpyewguywopbszu.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYWZjbnB5ZXdndXl3b3Bic3p1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY0MzA1NSwiZXhwIjoyMDgyMjE5MDU1fQ.H7y-dYmLFynWC3B-mi6kmIGP-8dUYeFiCmvX1IBbfTk";
const BUCKET = "videos";
const FRAMES_BASE = "C:\\서진클로\\workspace\\video_trim\\output";

// 181장 중 3장당 1장 선택 → 약 61장
const STEP = 3;

const FEATURE_MAP = {
  "요약":        "summary",
  "퀴즈":        "quiz",
  "플래시카드":  "flashcards",
  "ai튜터 (2)": "tutor",
  "모의고사":    "mockExam",
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function uploadFolder(folderName, featureKey) {
  const dir = join(FRAMES_BASE, folderName);

  // 전체 PNG 파일 정렬 후 3장당 1장 선택
  const allFiles = readdirSync(dir)
    .filter(f => f.endsWith(".png"))
    .sort();

  const selected = allFiles.filter((_, i) => i % STEP === 0);

  console.log(`\n📁 ${folderName} → frames/${featureKey}`);
  console.log(`   전체 ${allFiles.length}장 → ${selected.length}장 선택 (${STEP}장당 1장)`);

  for (let i = 0; i < selected.length; i++) {
    const localPath = join(dir, selected[i]);
    const remotePath = `frames/${featureKey}/${String(i + 1).padStart(3, "0")}.jpg`;

    // PNG → JPEG 80% 품질 변환
    const jpegBuffer = await sharp(localPath)
      .jpeg({ quality: 80 })
      .toBuffer();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(remotePath, jpegBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error(`  ❌ ${selected[i]}: ${error.message}`);
    } else {
      process.stdout.write(`  ✓ ${i + 1}/${selected.length}\r`);
    }
  }
  console.log(`  ✅ 완료: frames/${featureKey} (${selected.length}장)`);
}

async function main() {
  console.log("🚀 프레임 업로드 시작");
  console.log(`   방식: 3장당 1장 선택 + PNG→JPEG 80% 변환\n`);

  for (const [folderName, featureKey] of Object.entries(FEATURE_MAP)) {
    await uploadFolder(folderName, featureKey);
  }

  console.log("\n🎉 모든 업로드 완료!");
}

main().catch(console.error);
