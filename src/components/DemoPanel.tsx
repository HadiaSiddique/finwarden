"use client";
import { useState } from "react";
import { api } from "./api";

import type { Tab } from "./Dashboard";

const INBOX_SCENARIOS = new Set(["paypal_invoice_scam", "supplier_new_number"]);

const SCENARIOS: [string, string, string][] = [
  ["bank_change", "Acme: \"we changed our bank details\"", "A supplier email asks to redirect payments. Finwarden holds it until you call Acme on the number you already have."],
  ["ceo_request", "Urgent \"CEO\" request", "Pressure, secrecy and a brand-new account. Blocked: approval only works in the app with a passkey."],
  ["paypal_invoice_scam", "PayPal invoice with a phone number", "A real-looking PayPal invoice for a purchase Sara never made, with a scammer's \"call to cancel\" number."],
  ["supplier_new_number", "\"PrintHub\" has a new number", "A message claiming to be PrintHub asks Sara to call a number that isn't on file."],
  ["lookalike_invoice", "Invoice from \"Acrne Ltd\"", "A name that looks like your supplier Acme Ltd at a glance."],
  ["duplicate_invoice", "Same invoice twice", "PrintHub's invoice re-sent with a letter added to the number."],
  ["split_payments", "Payments split under the limit", "Three $950 payments that dodge the two-person rule."],
  ["friday_payouts", "Friday payout run", "Normal payments to freelancers and suppliers, ready to approve and send through PayPal Payouts."],
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
        <p className="mt-1 text-sm text-muted">Each scenario sends a realistic event through the same checks a real one would hit.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map(([key, title, desc]) => (
            <button key={key} className="card p-4 text-left transition hover:border-accent disabled:opacity-60" disabled={!!busy} onClick={() => run(key, { action: "scenario", name: key }, () => onRan(INBOX_SCENARIOS.has(key) ? "Scam inbox" : "Review"))}>
              <div className="font-medium">{title}</div>
              <div className="mt-1 text-sm text-muted">{desc}</div>
              <div className="mt-2 text-xs font-medium text-accent">{busy === key ? "Running…" : "Run scenario →"}</div>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red">{error}</p>}
      </section>
      <aside className="space-y-3">
        <div className="card p-4">
          <h3 className="font-semibold">Demo clock</h3>
          <p className="mt-1 text-sm text-muted">Skip ahead to show cooling-off periods ending. Every jump is logged.</p>
          <button className="btn mt-3 w-full justify-center" disabled={!!busy} onClick={() => run("clock", { action: "clock", hours: 24 })}>
            Fast-forward 24 hours
          </button>
        </div>
        <div className="card p-4">
          <h3 className="font-semibold">Reset demo</h3>
          <p className="mt-1 text-sm text-muted">Restores Sara&apos;s starting data. Passkeys are cleared, so you&apos;ll sign in again.</p>
          <button className="btn btn-danger mt-3 w-full justify-center" disabled={!!busy} onClick={() => confirm("Reset all demo data?") && run("reset", { action: "reset" }, onReset)}>
            Reset everything
          </button>
        </div>
      </aside>
    </div>
  );
}
