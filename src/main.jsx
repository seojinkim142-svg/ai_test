import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme/light.css";
import App from "./App.jsx";
import PromoPage from "./pages/PromoPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";

const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
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

createRoot(document.getElementById("root")).render(rootElement);

async function syncServiceWorkerRegistration() {
  const workerUrl = "/service-worker.js";

  try {
    const probe = await fetch(workerUrl, {
      method: "HEAD",
      cache: "no-store",
    });

    if (probe.ok) {
      const registration = await navigator.serviceWorker.register(workerUrl);
      registration.update().catch(() => {
        // Ignore explicit update check failures.
      });
      return;
    }
  } catch (error) {
    console.warn("Service worker availability check failed:", error);
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scriptUrl = String(
          registration?.active?.scriptURL || registration?.waiting?.scriptURL || registration?.installing?.scriptURL || ""
        );

        if (!scriptUrl.endsWith(workerUrl)) return false;

        const unregistered = await registration.unregister();
        if (typeof window !== "undefined" && window.caches) {
          const cacheKeys = await window.caches.keys();
          await Promise.all(
            cacheKeys
              .filter((key) => key.startsWith("exam-study-ai"))
              .map((key) => window.caches.delete(key))
          );
        }

        return unregistered;
      })
    );
  } catch (error) {
    console.warn("Service worker cleanup failed:", error);
  }
}

if (!IS_NATIVE_PLATFORM && import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    syncServiceWorkerRegistration().catch((error) => {
      console.warn("Service worker sync failed:", error);
    });
  });
}
