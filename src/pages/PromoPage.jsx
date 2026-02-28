import { memo, useCallback } from "react";
import PromoIntro from "../components/PromoIntro";

const PromoPage = memo(function PromoPage() {
  const handleStart = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/?auth=1");
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-slate-100">
      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 py-4">
        <div className="px-0">
          <section className="grid grid-cols-1 gap-6">
            <PromoIntro onStart={handleStart} />
          </section>
        </div>
      </main>
    </div>
  );
});

export default PromoPage;
