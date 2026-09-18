"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, LoaderCircle } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
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
    if (!response.ok) { setError(data.error ?? "No se pudo crear la cuenta."); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><Sparkles size={20} /> AI Schedule</div>
        <h1>Crea tu negocio</h1>
        <p>Tu cuenta será la de propietario/a. Luego podrás añadir locales y empleados reales.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Nombre del negocio<input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Nordhavn Dining Group" autoFocus /></label>
          <label>Primer local (opcional)<input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Nørrebro Bistro" /></label>
          <label>Tu nombre<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Correo electrónico<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Contraseña<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> Creando…</> : "Crear negocio"}</button>
        </form>
        <p className="auth-switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>
      </section>
    </main>
  );
}
