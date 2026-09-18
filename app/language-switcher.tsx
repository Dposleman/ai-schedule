"use client";

import { LANGUAGES } from "@/lib/i18n";
import { useLanguage } from "@/app/language-context";

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLanguage();
  return (
    <div className={compact ? "lang-switch compact" : "lang-switch"}>
      {LANGUAGES.map((option) => (
        <button
          key={option.code}
          className={option.code === lang ? "active" : ""}
          onClick={() => setLang(option.code)}
          type="button"
        >
          {option.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
