"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/app/brand-logo";
import { useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";

function ResetPasswordForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(data.error ?? t("common.somethingWrong")); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-top"><BrandLogo variant="auth" /><LanguageSwitcher compact /></div>
        <h1>{t("resetPassword.title")}</h1>
        <p>{t("resetPassword.subtitle")}</p>
        {!token ? (
          <>
            <p className="auth-error">{t("resetPassword.invalidLink")}</p>
            <p className="auth-switch"><Link href="/forgot-password">{t("resetPassword.requestNew")}</Link></p>
          </>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label>{t("resetPassword.password")}<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("resetPassword.minChars")} autoFocus /></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> {t("resetPassword.submitting")}</> : t("resetPassword.submit")}</button>
          </form>
        )}
        <p className="auth-switch"><Link href="/login">{t("forgotPassword.backToLogin")}</Link></p>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
