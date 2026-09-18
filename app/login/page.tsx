"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, LoaderCircle } from "lucide-react";
import { useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) { setError(data.error ?? t("login.error.generic")); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-top"><div className="auth-brand"><Sparkles size={20} /> {t("app.name")}</div><LanguageSwitcher compact /></div>
        <h1>{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
        <form onSubmit={submit} className="auth-form">
          <label>{t("login.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label>{t("login.password")}<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> {t("login.submitting")}</> : t("login.submit")}</button>
        </form>
        <p className="auth-switch">{t("login.firstTime")} <Link href="/signup">{t("login.createBusiness")}</Link></p>
      </section>
    </main>
  );
}
