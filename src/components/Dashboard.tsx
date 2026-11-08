"use client";
import { useCallback, useEffect, useState } from "react";
import type { DashboardData } from "@/services/dashboard";
import type { Me } from "./App";
import { api, dateTime, money, registerPasskey } from "./api";
import DemoPanel from "./DemoPanel";
import { AuditGrid, InvoicesGrid, PaymentsGrid } from "./Grids";
import Review from "./Review";
import { Kpi, Logo } from "./ui";

const TABS = ["Review", "Payments", "Invoices", "Audit log", "Demo"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ me, onAuthChange }: { me: Me; onAuthChange: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("Review");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<DashboardData>("/api/dashboard"));
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            {data?.demoMode && <span className="hidden text-muted sm:inline">Demo clock: {dateTime(data.now)}</span>}
            <span className="text-muted">
              {me.user!.name} · {me.user!.role === "owner" ? "Owner" : "Approver"}
            </span>
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${tab === t ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {t}
              {t === "Review" && data && data.kpis.heldForReview > 0 && <span className="pill pill-red ml-1.5">{data.kpis.heldForReview}</span>}
            </button>
          ))}
        </nav>
      </header>

      {me.paypalStub && (
        <div className="bg-amber-soft px-4 py-2 text-center text-sm text-amber">
          PayPal stub active: payouts are simulated locally. The deployed demo uses the real PayPal sandbox.
        </div>
      )}
      {!me.hasPasskey && <PasskeyBanner onDone={onAuthChange} />}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && <div className="card mb-4 border-red p-3 text-sm text-red">{error}</div>}
        {!data ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Owed to you" value={money(data.kpis.owedToYou)} />
              <Kpi label="Overdue" value={money(data.kpis.overdue)} tone={data.kpis.overdue ? "amber" : undefined} />
              <Kpi label="Due out this week" value={money(data.kpis.dueOutThisWeek)} />
              <Kpi label="Held for review" value={String(data.kpis.heldForReview)} tone={data.kpis.heldForReview ? "red" : "green"} />
            </section>
            <div className="mt-6">
              {tab === "Review" && <Review data={data} me={me} refresh={refresh} />}
              {tab === "Payments" && <PaymentsGrid rows={data.intents} />}
              {tab === "Invoices" && <InvoicesGrid rows={data.invoices} />}
              {tab === "Audit log" && <AuditGrid rows={data.audit} />}
              {tab === "Demo" && <DemoPanel refresh={refresh} onReset={onAuthChange} onRan={() => setTab("Review")} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function PasskeyBanner({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="bg-accent-soft px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          <strong>Add a passkey to approve payments.</strong> Approvals only work in this app with your fingerprint, face or device PIN.
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
            {busy ? "Waiting for your device…" : "Add passkey"}
          </button>
        </div>
      </div>
    </div>
  );
}
