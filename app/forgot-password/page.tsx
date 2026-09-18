"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, LoaderCircle } from "lucide-react";
import { useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(data.error ?? t("common.somethingWrong")); return; }
    setSent(true);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-top"><div className="auth-brand"><Sparkles size={20} /> {t("app.name")}</div><LanguageSwitcher compact /></div>
        <h1>{t("forgotPassword.title")}</h1>
        <p>{t("forgotPassword.subtitle")}</p>
        {sent ? (
          <p className="auth-success">{t("forgotPassword.sent")}</p>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label>{t("forgotPassword.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> {t("forgotPassword.submitting")}</> : t("forgotPassword.submit")}</button>
          </form>
        )}
        <p className="auth-switch"><Link href="/login">{t("forgotPassword.backToLogin")}</Link></p>
      </section>
    </main>
  );
}
