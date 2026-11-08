"use client";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7L16 2Z" fill="var(--accent)" />
        <path d="m10.5 16 4 4 7-8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Finwarden</span>
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  PENDING_APPROVAL: ["Needs approval", "pill-amber"],
  APPROVED: ["Approved", "pill-blue"],
  EXECUTING: ["Sending", "pill-blue"],
  SENT: ["Sent", "pill-green"],
  FAILED: ["Failed", "pill-red"],
  CANCELLED: ["Cancelled", "pill-gray"],
  HELD: ["Held", "pill-red"],
  PAID: ["Paid", "pill-green"],
  DRAFT: ["Draft", "pill-gray"],
  PARTIALLY_PAID: ["Part paid", "pill-amber"],
  OVERDUE: ["Overdue", "pill-red"],
  PENDING_CALLBACK: ["Waiting for callback", "pill-amber"],
  VERIFIED: ["Verified", "pill-green"],
  REJECTED: ["Rejected", "pill-red"],
};

export function StatusPill({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "pill-gray"];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" | "green" }) {
  const color = tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : tone === "green" ? "text-green" : "text-text";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
