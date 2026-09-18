"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, LoaderCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
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
    if (!response.ok) { setError(data.error ?? "No se pudo iniciar sesión."); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><Sparkles size={20} /> AI Schedule</div>
        <h1>Inicia sesión</h1>
        <p>Entra con la cuenta que te creó tu manager o propietario.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Correo electrónico<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label>Contraseña<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> Entrando…</> : "Entrar"}</button>
        </form>
        <p className="auth-switch">¿Primera vez aquí? <Link href="/signup">Crea tu negocio</Link></p>
      </section>
    </main>
  );
}
