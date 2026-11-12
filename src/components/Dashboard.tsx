"use client";
import { useCallback, useEffect, useState } from "react";
import type { DashboardData } from "@/services/dashboard";
import type { Me } from "./App";
import { api, dateTime, money, registerPasskey } from "./api";
import DemoPanel from "./DemoPanel";
import { AuditGrid, PaymentsGrid } from "./Grids";
import { Icon, type IconName } from "./icons";
import Inbox from "./Inbox";
import InvoicesPanel from "./InvoicesPanel";
import Overview from "./Overview";
import Review from "./Review";
import { Kpi, Logo } from "./ui";

const TABS: [Tab, IconName][] = [
  ["Overview", "chart"],
  ["Review", "shieldCheck"],
  ["Scam inbox", "inbox"],
  ["Invoices", "file"],
  ["Payments", "send"],
  ["Audit log", "clock"],
  ["Demo", "sparkles"],
];
export type Tab = "Overview" | "Review" | "Scam inbox" | "Invoices" | "Payments" | "Audit log" | "Demo";

export default function Dashboard({ me, onAuthChange }: { me: Me; onAuthChange: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setData(await api<DashboardData>("/api/dashboard"));
      setRefreshKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    api<DashboardData>("/api/dashboard").then(
      (d) => alive && setData(d),
      (e) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function signOut() {
    await api("/api/auth/logout", {});
    onAuthChange();
  }

  const initials = me.user!.name.split(" ").map((p) => p[0]).join("");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent sm:inline">Sara&apos;s Studio</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {data?.demoMode && (
              <span className="hidden items-center gap-1.5 text-muted md:flex">
                <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-green" /> Sandbox · {dateTime(data.now)}
              </span>
            )}
            <span className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{initials}</span>
              <span className="hidden leading-tight sm:block">
                <span className="block font-medium">{me.user!.name}</span>
                <span className="block text-xs text-muted">{me.user!.role === "owner" ? "Owner" : "Approver"}</span>
              </span>
            </span>
            <button className="btn btn-ghost" onClick={signOut} title="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {TABS.map(([t, icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? "tab-active" : ""}`}>
              <Icon name={icon} size={15} />
              {t}
              {t === "Review" && data && data.kpis.heldForReview > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-xs font-semibold ${tab === t ? "bg-white/25" : "bg-red-soft text-red"}`}>{data.kpis.heldForReview}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {me.paypalStub && (
        <div className="bg-amber-soft px-4 py-2 text-center text-sm text-amber">PayPal stub active: payouts are simulated locally. The deployed demo uses the real PayPal sandbox.</div>
      )}
      {!me.hasPasskey && <PasskeyBanner onDone={onAuthChange} />}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && <div className="card mb-4 border-red p-3 text-sm text-red">{error}</div>}
        {!data ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div key={tab} className="fade-up">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon="wallet" label="Owed to you" value={money(data.kpis.owedToYou)} hint={`${data.invoices.filter((i) => i.status === "SENT").length} open invoices`} />
              <Kpi icon="clock" label="Overdue" value={money(data.kpis.overdue)} tone={data.kpis.overdue ? "amber" : undefined} hint="Reminders go out automatically" />
              <Kpi icon="send" label="Due out this week" value={money(data.kpis.dueOutThisWeek)} hint="Payments waiting to send" />
              <Kpi icon="shieldCheck" label="Held for review" value={String(data.kpis.heldForReview)} tone={data.kpis.heldForReview ? "red" : "green"} hint={data.kpis.heldForReview ? "Needs your decision" : "All clear"} />
            </section>
            <div className="mt-6">
              {tab === "Overview" && <Overview data={data} goTo={setTab} />}
              {tab === "Review" && <Review data={data} me={me} refresh={refresh} />}
              {tab === "Scam inbox" && <Inbox refreshKey={refreshKey} />}
              {tab === "Invoices" && <InvoicesPanel data={data} refresh={refresh} />}
              {tab === "Payments" && <PaymentsGrid rows={data.intents} />}
              {tab === "Audit log" && <AuditGrid rows={data.audit} />}
              {tab === "Demo" && <DemoPanel refresh={refresh} onReset={onAuthChange} onRan={setTab} />}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted">
        Finwarden · PayPal sandbox only · AI reads, rules decide, your passkey approves
      </footer>
    </div>
  );
}

function PasskeyBanner({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-b border-border bg-accent-soft px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <Icon name="key" size={18} className="text-accent" />
          <span>
            <strong>Add a passkey to approve payments.</strong> Approvals only work in this app, with your fingerprint, face or device PIN.
          </span>
        </span>
        <div className="flex items-center gap-3">
          {error && <span className="text-red">{error}</span>}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await registerPasskey();
                onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="key" size={16} />
            {busy ? "Waiting for your device…" : "Add passkey"}
          </button>
        </div>
      </div>
    </div>
  );
}
