"use client";
import { useState } from "react";
import type { DashboardData } from "@/services/dashboard";
import type { Me } from "./App";
import { api, approveWithPasskey, dateTime, money } from "./api";
import { StatusPill } from "./ui";

type Intent = DashboardData["intents"][number];
type Flag = Intent["flags"][number];

export default function Review({ data, me, refresh }: { data: DashboardData; me: Me; refresh: () => Promise<void> }) {
  const open = data.intents.filter((i) => i.status === "PENDING_APPROVAL" || i.status === "APPROVED" || i.status === "FAILED");
  const pendingChanges = data.changeRequests.filter((c) => c.status === "PENDING_CALLBACK");
  const ready = open.filter((i) => i.status === "APPROVED" && !i.coolingOffEndsAt);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payments waiting on you</h2>
          {ready.length > 0 && <SendButton ids={ready.map((i) => i.id)} refresh={refresh} />}
        </div>
        {open.length === 0 ? (
          <div className="card p-6 text-center text-muted">Nothing waiting. Run a scenario from the Demo tab to see Finwarden at work.</div>
        ) : (
          <div className="space-y-3">
            {open.map((i) => (
              <IntentCard key={i.id} intent={i} me={me} refresh={refresh} />
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Payment detail changes</h2>
          {pendingChanges.length === 0 ? (
            <div className="card p-4 text-sm text-muted">No changes waiting for a callback.</div>
          ) : (
            pendingChanges.map((c) => <ChangeCard key={c.id} change={c} refresh={refresh} />)
          )}
        </section>
        <section className="card p-4 text-sm">
          <h3 className="font-semibold">How Finwarden decides</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
            <li>The AI reads and explains. Rules in code decide.</li>
            <li>Red flags hold a payment until they&apos;re resolved.</li>
            <li>Approval needs your passkey, bound to the exact amount and recipient.</li>
            <li>{money(data.thresholds.twoApproverMinor)} or more needs two people.</li>
            <li>New or changed payees wait {data.thresholds.coolingOffHours} hours.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function IntentCard({ intent: i, me, refresh }: { intent: Intent; me: Me; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openFlags = i.flags.filter((f) => !f.resolvedAt);
  const alreadyApproved = i.approvers.includes(me.user!.name);
  const canApprove = i.status === "PENDING_APPROVAL" && i.openRed === 0 && i.openAmber === 0 && !alreadyApproved && me.hasPasskey;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card p-4 ${i.openRed ? "border-red" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{money(i.amount, i.currency)}</span>
            <span className="text-muted">to</span>
            <span className="font-medium">{i.payeeName}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {i.payout.method.replace("_", " ")}: {i.payout.receiver}
            {i.invoiceNumber && <> · {i.invoiceNumber}</>} · created {dateTime(i.createdAt)}
          </div>
        </div>
        <StatusPill status={i.openRed ? "HELD" : i.status} />
      </div>

      {i.sourceText && <blockquote className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">&ldquo;{i.sourceText}&rdquo;</blockquote>}

      {openFlags.length > 0 && (
        <ul className="mt-3 space-y-2">
          {openFlags.map((f) => (
            <FlagRow key={f.id} flag={f} me={me} busy={busy} act={act} />
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-muted">
          Approvals {i.approvers.length}/{i.requiredApprovers}
          {i.approvers.length > 0 && <> ({i.approvers.join(", ")})</>}
          {i.coolingOffEndsAt && <> · cooling-off until {dateTime(i.coolingOffEndsAt)}</>}
        </span>
        <div className="flex gap-2">
          <button className="btn" disabled={busy} onClick={() => act(() => api(`/api/intents/${i.id}/cancel`, { reason: "Cancelled from review" }))}>
            Cancel
          </button>
          {i.status === "PENDING_APPROVAL" && (
            <button className="btn btn-primary" disabled={busy || !canApprove} title={!me.hasPasskey ? "Add a passkey first" : alreadyApproved ? "A second person must approve" : i.openRed || i.openAmber ? "Deal with the flags first" : ""} onClick={() => act(() => approveWithPasskey(i.id))}>
              {alreadyApproved ? "Waiting for second approver" : "Approve with passkey"}
            </button>
          )}
          {i.status === "APPROVED" && <SendButton ids={[i.id]} refresh={refresh} disabled={!!i.coolingOffEndsAt} />}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </article>
  );
}

function FlagRow({ flag: f, me, busy, act }: { flag: Flag; me: Me; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const red = f.severity === "red";
  const acknowledged = !!f.acknowledgedAt;
  const manualClearAllowed = red && me.user!.role === "owner" && f.ruleId !== "R1" && f.ruleId !== "R5";
  return (
    <li className={`rounded-lg px-3 py-2 text-sm ${red ? "bg-red-soft" : "bg-amber-soft"}`}>
      <div className="flex items-start justify-between gap-3">
        <p>
          <span className={`pill mr-2 ${red ? "pill-red" : "pill-amber"}`}>{f.ruleId}</span>
          {f.why}
        </p>
        {!red && !acknowledged && (
          <button className="btn shrink-0" disabled={busy} onClick={() => act(() => api(`/api/flags/${f.id}`, { action: "acknowledge" }))}>
            Acknowledge
          </button>
        )}
        {manualClearAllowed && (
          <button
            className="btn btn-danger shrink-0"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("Why is this safe? This is recorded in the audit log.");
              if (reason) act(() => api(`/api/flags/${f.id}`, { action: "resolve", reason }));
            }}
          >
            Clear…
          </button>
        )}
      </div>
      {acknowledged && <p className="mt-1 text-xs text-muted">Acknowledged.</p>}
      {red && (f.ruleId === "R1" || f.ruleId === "R5") && <p className="mt-1 text-xs text-muted">Clears only after you verify the change with the contact already on file.</p>}
    </li>
  );
}

function ChangeCard({ change: c, refresh }: { change: DashboardData["changeRequests"][number]; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function decide(confirmed: boolean) {
    setBusy(true);
    try {
      await api(`/api/payee-changes/${c.id}`, { confirmed });
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card mb-3 p-4 text-sm">
      <div className="font-medium">{c.payee} wants payments sent to</div>
      <div className="mt-0.5 break-all text-muted">{c.requestedPayout.receiver}</div>
      <div className="mt-3 rounded-lg bg-surface-2 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Call them back on the number you already have</div>
        <div className="mt-1 text-base font-semibold">{c.callbackContact ?? "No contact on file"}</div>
        <div className="mt-1 text-xs text-muted">Never use a number from the request itself. (In the demo, the call is simulated.)</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn justify-center" disabled={busy} onClick={() => decide(false)}>
          They didn&apos;t ask
        </button>
        <button className="btn btn-primary justify-center" disabled={busy} onClick={() => decide(true)}>
          They confirmed
        </button>
      </div>
    </div>
  );
}

function SendButton({ ids, refresh, disabled }: { ids: string[]; refresh: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button
        className="btn btn-primary"
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ sent: string[]; refused: { reasons: string[] }[]; error?: string }>("/api/payouts/execute", { intentIds: ids });
            setMsg(r.error ? `PayPal error: ${r.error}` : `${r.sent.length} sent${r.refused.length ? `, ${r.refused.length} refused: ${r.refused[0].reasons[0]}` : ""}`);
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : ids.length > 1 ? `Send ${ids.length} approved via PayPal` : "Send via PayPal"}
      </button>
    </span>
  );
}
