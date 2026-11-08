"use client";
import { useCallback, useEffect, useState } from "react";
import { api, dateTime } from "./api";

interface Flag {
  id: string;
  ruleId: string;
  severity: "red" | "amber";
  why: string;
}
interface Item {
  id: string;
  rawText: string;
  verdict: "safe" | "suspicious" | "scam" | "pending";
  createdAt: string;
  flags: Flag[];
}
interface Verdict {
  verdict: "safe" | "suspicious" | "scam";
  flags: Flag[];
  aiAvailable: boolean;
  extracted: { summary: string; language: string; claimedSender: string | null; ai: { provider: string; model: string; cached: boolean } | null } | null;
}

const VERDICT: Record<string, [string, string, string]> = {
  scam: ["Likely scam", "pill-red", "Don't pay, call or click anything in it."],
  suspicious: ["Be careful", "pill-amber", "Check before you act."],
  safe: ["No warning signs", "pill-green", "Nothing matched known scam patterns."],
};

const EXAMPLES = [
  "PayPal Invoice: Geek Squad annual plan $389.00. If you did not authorise this, call +1 877 555 0123 within 24 hours.",
  "Hi Sara, Acme Ltd here. Please send future payments to accounts@acme-ltd.example, our bank changed.",
  "سارہ بول رہی ہوں، میٹنگ میں ہوں۔ فوراً اس نئے اکاؤنٹ میں 8,000 ڈالر بھیج دیں، کسی کو مت بتائیں۔",
  "PayPal: You received $450.00 USD from Bright Bakery. Log in to paypal.com to see details.",
];

export default function Inbox({ refreshKey }: { refreshKey: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Verdict | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(() => api<{ items: Item[] }>("/api/inbox").then((r) => setItems(r.items)), []);
  useEffect(() => {
    let alive = true;
    api<{ items: Item[] }>("/api/inbox").then((r) => alive && setItems(r.items));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Verdict>("/api/inbox", { text }));
      await loadItems();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <h2 className="text-lg font-semibold">Scam inbox</h2>
        <p className="mt-1 text-sm text-muted">Paste any invoice, money request or &ldquo;you&apos;ve been paid&rdquo; email, in any language.</p>
        <textarea className="input mt-3 min-h-36 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the message here…" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={busy || text.trim().length < 10} onClick={check}>
            {busy ? "Checking…" : "Check message"}
          </button>
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="btn text-xs" onClick={() => setText(ex)}>
              Example {i + 1}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red">{error}</p>}

        {result && (
          <div className="card mt-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${VERDICT[result.verdict][1]}`}>{VERDICT[result.verdict][0]}</span>
              <span className="text-sm text-muted">{VERDICT[result.verdict][2]}</span>
            </div>
            {result.extracted && <p className="mt-3 text-sm">{result.extracted.summary}</p>}
            {result.flags.length > 0 && (
              <ul className="mt-3 space-y-2">
                {result.flags.map((f) => (
                  <li key={f.ruleId + f.why} className={`rounded-lg px-3 py-2 text-sm ${f.severity === "red" ? "bg-red-soft" : "bg-amber-soft"}`}>
                    <span className={`pill mr-2 ${f.severity === "red" ? "pill-red" : "pill-amber"}`}>{f.ruleId}</span>
                    {f.why}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              {result.extracted?.ai
                ? `Signals read by ${result.extracted.ai.provider === "cache" ? "cached AI result" : `${result.extracted.ai.provider}/${result.extracted.ai.model}`}; the verdict comes from Finwarden's rules.`
                : "AI unavailable right now, so only the contact checks ran. Rule checks still protect your payments."}
            </p>
          </div>
        )}
      </section>

      <aside>
        <h3 className="mb-3 font-semibold">Recently checked</h3>
        {items.length === 0 ? (
          <div className="card p-4 text-sm text-muted">Nothing checked yet.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`pill ${VERDICT[it.verdict]?.[1] ?? "pill-gray"}`}>{VERDICT[it.verdict]?.[0] ?? it.verdict}</span>
                  <span className="text-xs text-muted">{dateTime(it.createdAt)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-muted">{it.rawText}</p>
                {it.flags.length > 0 && <p className="mt-1 text-xs text-muted">Rules: {it.flags.map((f) => f.ruleId).join(", ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
