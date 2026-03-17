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
