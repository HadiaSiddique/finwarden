"use client";
import { useState } from "react";
import type { DashboardData } from "@/services/dashboard";
import { api } from "./api";
import { InvoicesGrid } from "./Grids";

export default function InvoicesPanel({ data, refresh }: { data: DashboardData; refresh: () => Promise<void> }) {
  const [text, setText] = useState("Bill Ali $800 for the logo, due Friday");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(body: object, done: (r: Record<string, unknown>) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Record<string, unknown>>("/api/invoices", body);
      setMsg({ ok: true, text: done(r) });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="text-sm font-medium" htmlFor="inv-text">
          New invoice: just describe it
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="inv-text" className="input" value={text} onChange={(e) => setText(e.target.value)} />
          <button
            className="btn btn-primary shrink-0 justify-center"
            disabled={busy || text.trim().length < 5}
            onClick={() => run({ action: "draft", text }, (r) => `Drafted for ${r.client}: ${r.description}. Check it below, then click "Send via PayPal".`)}
          >
            {busy ? "Working…" : "Draft invoice"}
          </button>
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-green" : "text-red"}`}>{msg.text}</p>}
      </div>
      <InvoicesGrid
        rows={data.invoices}
        act={(action, invoiceId) =>
          run({ action, invoiceId }, (r) =>
            action === "send"
              ? `Sent through PayPal Invoicing (${r.id}).`
              : action === "remind"
                ? `Sent a ${r.tone} reminder through PayPal: "${String(r.note).slice(0, 120)}…"`
                : `PayPal says: ${r.status}${r.paidAmount != null ? `, paid ${(Number(r.paidAmount) / 100).toFixed(2)}` : ""}.`,
          )
        }
      />
    </div>
  );
}
