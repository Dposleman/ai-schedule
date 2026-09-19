"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, LOCALE, Lang, translate } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-client";

const STORAGE_KEY = "ai-schedule-lang";

type LanguageContextValue = {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang, persist?: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLang,
  persistToAccount,
  children,
}: {
  initialLang?: Lang;
  persistToAccount?: boolean;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? DEFAULT_LANG);

  // Reads localStorage, which doesn't exist during SSR, so the saved
  // language can't be known until after mount — rendering the default (or
  // account) language first on both server and client, then correcting it
  // here, is what keeps the initial client render matching the server HTML
  // instead of triggering a hydration mismatch.
  useEffect(() => {
    if (initialLang) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "en" || saved === "da") setLangState(saved);
    } catch {
      // ignore
    }
  }, [initialLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (next: Lang, persist = true) => {
      setLangState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      if (persist && persistToAccount) {
        apiFetch("/api/account/language", {
          method: "PATCH",
          body: JSON.stringify({ language: next }),
        }).catch(() => {});
      }
    },
    [persistToAccount]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      locale: LOCALE[lang],
      setLang,
      t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    }),
    [lang, setLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
