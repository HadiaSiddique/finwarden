"use client";
import { useState } from "react";
import { api } from "./api";
import { Logo } from "./ui";

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: "sara" | "omar") {
    setBusy(userId);
    setError(null);
    try {
      await api("/api/auth/demo", { userId, password });
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-7">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Your AI finance team.</h1>
        <p className="mt-1 text-muted">Every dollar in, every dollar out, guarded.</p>

        <label className="mt-7 block text-sm font-medium" htmlFor="pw">
          Demo password
        </label>
        <input id="pw" className="input mt-1.5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="From the README" />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn btn-primary justify-center" disabled={!!busy || !password} onClick={() => signIn("sara")}>
            {busy === "sara" ? "Signing in…" : "Sign in as Sara"}
          </button>
          <button className="btn justify-center" disabled={!!busy || !password} onClick={() => signIn("omar")}>
            {busy === "omar" ? "Signing in…" : "Sign in as Omar"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">Sara owns the business. Omar is the second approver for payments of $1,000 or more.</p>
        {error && <p className="mt-3 text-sm text-red">{error}</p>}

        <div className="mt-6 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          PayPal sandbox only. No real money moves. Payments are approved with a passkey on your own device, never by email, chat or phone.
        </div>
      </div>
    </main>
  );
}
