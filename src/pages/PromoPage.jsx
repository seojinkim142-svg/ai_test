import { memo, useCallback, useEffect, useState } from "react";
import PromoIntro from "../components/PromoIntro";

const OUTPUT_LANGUAGE_STORAGE_KEY = "zeusian-output-language";
const DEFAULT_OUTPUT_LANGUAGE = "ko";
const AVAILABLE_OUTPUT_LANGUAGES = ["en", "zh", "ja", "hi", "ko"];

const PromoPage = memo(function PromoPage() {
  const [outputLanguage, setOutputLanguage] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_OUTPUT_LANGUAGE;
    const stored = String(window.localStorage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    return AVAILABLE_OUTPUT_LANGUAGES.includes(stored) ? stored : DEFAULT_OUTPUT_LANGUAGE;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, outputLanguage);
  }, [outputLanguage]);

  const handleStart = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/?auth=1");
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-900">
      <main className="relative z-10 min-h-screen">
        <PromoIntro
          onStart={handleStart}
          outputLanguage={outputLanguage}
          setOutputLanguage={setOutputLanguage}
        />
      </main>
    </div>
  );
});

export default PromoPage;
