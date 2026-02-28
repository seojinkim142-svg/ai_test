import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme/light.css";
import App from "./App.jsx";
import PromoPage from "./pages/PromoPage.jsx";

const path = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
const normalizedPath = path.replace(/\/+$/, "") || "/";
const promoOnlyPaths = new Set(["/start", "/intro", "/landing"]);
const RootPage = promoOnlyPaths.has(normalizedPath) ? PromoPage : App;

createRoot(document.getElementById("root")).render(<RootPage />);
