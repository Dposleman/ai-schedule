"use client";

import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { useLanguage } from "@/app/language-context";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ textAlign: "center" }}>
        <div className="modal-orb"><MapPinOff size={22} /></div>
        <h1>{t("notFound.title")}</h1>
        <p>{t("notFound.subtitle")}</p>
        <Link href="/" className="primary-button auth-submit" style={{ display: "inline-flex", justifyContent: "center", textDecoration: "none" }}>{t("notFound.backHome")}</Link>
      </section>
    </main>
  );
}
