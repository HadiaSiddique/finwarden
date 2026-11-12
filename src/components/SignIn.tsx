"use client";
import { useState } from "react";
import { api } from "./api";
import { Icon, type IconName } from "./icons";
import { Logo } from "./ui";

const FEATURES: [IconName, string, string][] = [
  ["shieldCheck", "Stops payment scams", "Fake bank-detail changes, lookalike suppliers, duplicate invoices and urgent “CEO” requests are held before money moves."],
  ["file", "Gets you paid", "Describe an invoice in a sentence. Clients pay through PayPal, Pay Later or card, and reminders write themselves."],
  ["send", "Pays your people", "Batch payouts to freelancers and suppliers through PayPal, each one re-checked moments before it leaves."],
  ["key", "Approvals only with your passkey", "Never by email, chat or phone. Each approval is locked to the exact amount and recipient."],
];

const STATS: [string, string][] = [
  ["92.9%", "of held-out scams caught on the first run"],
  ["9", "fraud rules, all explainable"],
  ["0", "payments sent past a red flag"],
];

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
    <main className="grid flex-1 lg:grid-cols-[1.15fr_1fr]">
      <section className="bg-hero relative overflow-hidden px-6 py-10 text-white sm:px-12 lg:py-16">
        <div className="bg-hero-dots pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-xl">
          <div className="flex items-center gap-2">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
              <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7L16 2Z" fill="#ffffff" />
              <path d="m10.5 16 4 4 7-8" fill="none" stroke="#0f6b55" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xl font-semibold tracking-tight">Finwarden</span>
            <span className="ml-2 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">PayPal + AI</span>
          </div>

          <h1 className="mt-10 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Your AI finance team.
            <br />
            <span className="text-emerald-200">Every dollar guarded.</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-white/80">
            For freelancers and small studios: get paid, pay your people, and stop the scams aimed at exactly those moments.
          </p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map(([icon, title, text], i) => (
              <li key={title} className="fade-up flex gap-3" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">
                  <Icon name={icon} size={18} />
                </span>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-sm text-white/75">{text}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 grid grid-cols-3 gap-3">
            {STATS.map(([n, label]) => (
              <div key={label} className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-sm">
                <div className="text-2xl font-semibold tabular-nums">{n}</div>
                <div className="mt-0.5 text-xs leading-snug text-white/70">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="card fade-up w-full max-w-md p-7 shadow-xl">
          <Logo />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">Try the live demo</h2>
          <p className="mt-1 text-sm text-muted">Meet Sara, who runs a small design studio. Her money is already in Finwarden.</p>

          <label className="mt-6 block text-sm font-medium" htmlFor="pw">
            Demo password
          </label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="lock" size={16} />
            </span>
            <input
              id="pw"
              className="input"
              style={{ paddingLeft: "2.3rem" }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && signIn("sara")}
              placeholder="finwarden-demo"
            />
          </div>

          <div className="mt-4 space-y-2.5">
            <button className="btn btn-primary w-full justify-between py-3" disabled={!!busy || !password} onClick={() => signIn("sara")}>
              <span className="flex items-center gap-2.5 text-left">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">SA</span>
                <span>
                  <span className="block font-semibold">{busy === "sara" ? "Signing in…" : "Sign in as Sara"}</span>
                  <span className="block text-xs opacity-80">Owner of Sara&apos;s Studio</span>
                </span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="btn w-full justify-between py-3" disabled={!!busy || !password} onClick={() => signIn("omar")}>
              <span className="flex items-center gap-2.5 text-left">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">OS</span>
                <span>
                  <span className="block font-semibold">{busy === "omar" ? "Signing in…" : "Sign in as Omar"}</span>
                  <span className="block text-xs text-muted">Second approver for $500+</span>
                </span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red">{error}</p>}

          <div className="mt-6 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>PayPal sandbox only: no real money moves. All people and businesses in the demo are fictional.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
