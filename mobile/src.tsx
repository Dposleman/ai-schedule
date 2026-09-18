import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "../app/globals.css";

// The mobile bundle ships with no backend of its own — it's a static
// WebView app — so every API call needs to be pointed at the deployed
// backend instead of the page's own (irrelevant) origin. VITE_API_URL lets
// a dev build point at a local server; production native builds fall back
// to the live deployment.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
window.__API_BASE__ = env.VITE_API_URL || "https://ai-schedule-alpha.vercel.app";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
