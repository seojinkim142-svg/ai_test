import { Suspense, lazy, memo } from "react";

const LandingIntro = lazy(() => import("./LandingIntro"));

const PromoIntro = memo(function PromoIntro({
  onStart,
  outputLanguage = "ko",
  setOutputLanguage,
}) {
  return (
    <Suspense fallback={null}>
      <LandingIntro
        onStart={onStart}
        outputLanguage={outputLanguage}
        setOutputLanguage={setOutputLanguage}
      />
    </Suspense>
  );
});

export default PromoIntro;
