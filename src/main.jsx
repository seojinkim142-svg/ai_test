import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme/light.css";
import App from "./App.jsx";
import PromoPage from "./pages/PromoPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";

const path = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
const normalizedPath = path.replace(/\/+$/, "") || "/";
const promoOnlyPaths = new Set(["/start", "/intro", "/landing"]);
const legalPages = {
  "/terms": <LegalPage documentType="terms" />,
  "/legal/terms": <LegalPage documentType="terms" />,
  "/privacy": <LegalPage documentType="privacy" />,
  "/legal/privacy": <LegalPage documentType="privacy" />,
};

const rootElement = legalPages[normalizedPath] ?? (promoOnlyPaths.has(normalizedPath) ? <PromoPage /> : <App />);

createRoot(document.getElementById("root")).render(rootElement);

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("Vite preload error detected, forcing a one-time reload.", event);
    event?.preventDefault?.();

    const reloadKey = "vite-preload-reload";
    try {
      if (window.sessionStorage.getItem(reloadKey) === "1") return;
      window.sessionStorage.setItem(reloadKey, "1");
    } catch {
      // Ignore sessionStorage access failures.
    }

    window.location.reload();
  });
}

if (import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        registration.update().catch(() => {
          // Ignore explicit update check failures.
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}
