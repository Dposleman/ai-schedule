"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/app/brand-logo";
import { useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [businessName, setBusinessName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, locationName, name, email, password }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) { setError(data.error ?? t("signup.error.generic")); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-top"><BrandLogo variant="auth" /><LanguageSwitcher compact /></div>
        <h1>{t("signup.title")}</h1>
        <p>{t("signup.subtitle")}</p>
        <form onSubmit={submit} className="auth-form">
          <label>{t("signup.businessName")}<input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Nordhavn Dining Group" autoFocus /></label>
          <label>{t("signup.firstLocation")}<input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Nørrebro Bistro" /></label>
          <label>{t("signup.yourName")}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>{t("signup.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{t("signup.password")}<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("signup.minChars")} /></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> {t("signup.submitting")}</> : t("signup.submit")}</button>
        </form>
        <p className="auth-switch">{t("signup.haveAccount")} <Link href="/login">{t("signup.signIn")}</Link></p>
      </section>
    </main>
  );
}
