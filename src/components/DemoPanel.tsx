"use client";
import { useState } from "react";
import { api } from "./api";
import type { Tab } from "./Dashboard";
import { Icon, IconBadge, type IconName } from "./icons";

type Tone = "red" | "amber" | "green" | "blue";
const SCENARIOS: { key: string; title: string; desc: string; icon: IconName; tone: Tone; tag: string; goes: Tab }[] = [
  { key: "bank_change", title: "“We changed our bank details”", desc: "Acme asks to redirect its $140 payment. Held until Sara calls Acme on the number already on file.", icon: "alert", tone: "red", tag: "Business email compromise", goes: "Review" },
  { key: "ceo_request", title: "Urgent “CEO” request", desc: "“Pay $2,400 today, keep it quiet.” Pressure, secrecy and a brand-new account: blocked.", icon: "zap", tone: "red", tag: "Impersonation", goes: "Review" },
  { key: "paypal_invoice_scam", title: "PayPal invoice with a phone number", desc: "A real-looking $499.99 invoice for software Sara never bought, with a “call to cancel” number.", icon: "phone", tone: "red", tag: "Invoice phishing", goes: "Scam inbox" },
  { key: "supplier_new_number", title: "Supplier with a “new number”", desc: "A message claiming to be PrintHub asks Sara to call a number that isn't on file.", icon: "phone", tone: "amber", tag: "Contact mismatch", goes: "Scam inbox" },
  { key: "lookalike_invoice", title: "Invoice from “Acrne Ltd”", desc: "$135 to a name that reads as “Acme” at a glance. Caught by the lookalike check.", icon: "copy", tone: "amber", tag: "Lookalike supplier", goes: "Review" },
  { key: "duplicate_invoice", title: "Same invoice twice", desc: "PrintHub's $62 invoice comes back as PH-8812-A. Blocked as an altered copy.", icon: "file", tone: "amber", tag: "Duplicate invoice", goes: "Review" },
  { key: "split_payments", title: "Split to dodge approval", desc: "Three $190 payments to one person: each under the $500 two-person limit, together over it.", icon: "split", tone: "amber", tag: "Split payments", goes: "Review" },
  { key: "friday_payouts", title: "Friday payout run", desc: "Hamza $150, PrintHub $48, Lina $90. Clean payments ready to approve and send through PayPal.", icon: "send", tone: "green", tag: "Normal day", goes: "Review" },
];

export default function DemoPanel({ refresh, onReset, onRan }: { refresh: () => Promise<void>; onReset: () => void; onRan: (tab: Tab) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, body: unknown, after?: () => void) {
    setBusy(key);
    setError(null);
    try {
      await api("/api/demo", body);
      await refresh();
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section>
        <h2 className="text-lg font-semibold">Sara&apos;s day</h2>
        <p className="mt-1 text-sm text-muted">Each scenario sends a realistic event through the same checks a real one would hit. Scam patterns are taken from the FBI IC3 2025 report, PayPal&apos;s scam list and real cases.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.key}
              className="card card-hover fade-up group flex flex-col gap-3 p-4 text-left disabled:opacity-60"
              style={{ animationDelay: `${i * 40}ms` }}
              disabled={!!busy}
              onClick={() => run(s.key, { action: "scenario", name: s.key }, () => onRan(s.goes))}
            >
              <div className="flex items-start gap-3">
                <IconBadge name={s.icon} tone={s.tone} />
                <div className="min-w-0">
                  <span className={`pill pill-${s.tone === "green" ? "green" : s.tone === "red" ? "red" : "amber"}`}>{s.tag}</span>
                  <div className="mt-1 font-semibold">{s.title}</div>
                </div>
              </div>
              <p className="text-sm text-muted">{s.desc}</p>
              <span className="mt-auto flex items-center gap-1 text-sm font-medium text-accent">
                {busy === s.key ? "Running…" : "Run scenario"}
                <Icon name="arrowRight" size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red">{error}</p>}
      </section>
      <aside className="space-y-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="clock" size={16} className="text-accent" /> Demo clock
          </div>
          <p className="mt-1 text-sm text-muted">New or changed payees wait 24 hours. Skip ahead to see the hold end. Every jump is logged.</p>
          <button className="btn mt-3 w-full justify-center" disabled={!!busy} onClick={() => run("clock", { action: "clock", hours: 24 })}>
            Fast-forward 24 hours
          </button>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="refresh" size={16} className="text-red" /> Reset demo
          </div>
          <p className="mt-1 text-sm text-muted">Restores Sara&apos;s starting data. Passkeys are cleared, so you&apos;ll sign in again.</p>
          <button className="btn btn-danger mt-3 w-full justify-center" disabled={!!busy} onClick={() => confirm("Reset all demo data?") && run("reset", { action: "reset" }, onReset)}>
            Reset everything
          </button>
        </div>
      </aside>
    </div>
  );
}
