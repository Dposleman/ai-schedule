"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/app/language-context";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    // Vercel captures console.error from server components in its function
    // logs; this also surfaces client-side render crashes there, which is
    // otherwise the app's only window into "something broke in production".
    console.error("[app] unhandled render error", error);
  }, [error]);

  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ textAlign: "center" }}>
        <div className="modal-orb"><AlertTriangle size={22} /></div>
        <h1>{t("error.title")}</h1>
        <p>{t("error.subtitle")}</p>
        <button className="primary-button auth-submit" onClick={() => reset()}>{t("error.retry")}</button>
      </section>
    </main>
  );
}
