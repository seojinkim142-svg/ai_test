import { memo, useCallback } from "react";
import PromoIntro from "../components/PromoIntro";

const PromoPage = memo(function PromoPage() {
  const handleStart = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/?auth=1");
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-900">
      <main className="relative z-10 min-h-screen">
        <PromoIntro onStart={handleStart} />
      </main>
    </div>
  );
});

export default PromoPage;
