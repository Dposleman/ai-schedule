"use client";

import { useEffect, useState } from "react";
import { Sparkles, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { LanguageProvider, useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";
import AppShell from "@/app/app-shell";
import type { Lang } from "@/lib/i18n";

type Role = "owner" | "manager" | "employee";

type CurrentUser = {
  id: string; orgId: string; name: string; email: string; role: Role;
  occupation: string; phone: string; color: string;
  homeLocationId: string | null; currentLocationId: string | null;
  language: Lang;
};

// The web app gets its signed-in user server-side (app/page.tsx). The
// mobile bundle has no server of its own — it's a static WebView app — so it
// has to ask the API for a session on launch, and show its own login screen
// when there isn't one.
function MobileLogin({ onSignedIn }: { onSignedIn: (user: CurrentUser) => void }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const loginRes = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) throw new Error(loginData.error ?? t("login.error.generic"));

      const meRes = await apiFetch("/api/auth/me");
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.user) throw new Error(t("login.error.generic"));
      onSignedIn(meData.user as CurrentUser);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("login.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-top">
          <div className="auth-brand"><Sparkles size={20} /> {t("app.name")}</div>
          <LanguageSwitcher compact />
        </div>
        <h1>{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
        <form onSubmit={submit} className="auth-form">
          <label>{t("login.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label>{t("login.password")}<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>
            {loading ? <><LoaderCircle className="spin" size={16} /> {t("login.submitting")}</> : t("login.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}

function MobileRoot() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const { setLang } = useLanguage();

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setLang(data.user.language, false);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [setLang]);

  if (checking) {
    return (
      <main className="auth-shell">
        <LoaderCircle className="spin" size={28} />
      </main>
    );
  }

  if (!user) {
    return (
      <MobileLogin
        onSignedIn={(signedInUser) => {
          setUser(signedInUser);
          setLang(signedInUser.language, false);
        }}
      />
    );
  }

  return <AppShell currentUser={user} onLoggedOut={() => setUser(null)} />;
}

export default function App() {
  return (
    <LanguageProvider persistToAccount>
      <MobileRoot />
    </LanguageProvider>
  );
}
