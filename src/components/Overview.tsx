"use client";
import type { DashboardData } from "@/services/dashboard";
import { dateTime, money, shortDate } from "./api";
import { Icon, IconBadge, type IconName } from "./icons";

const ACTION_ICON: Record<string, [IconName, "accent" | "red" | "amber" | "green" | "blue"]> = {
  "intent.created": ["send", "blue"],
  "intent.approved": ["key", "green"],
  "payout.submitted": ["send", "green"],
  "execution.refused": ["shield", "red"],
  "inbox.checked": ["inbox", "amber"],
  "payee_change.requested": ["alert", "red"],
  "payee_change.rejected": ["shield", "red"],
  "payee_change.verified": ["check", "green"],
  "invoice.drafted": ["file", "blue"],
  "invoice.paid": ["wallet", "green"],
  "invoice.reminded": ["clock", "amber"],
};

export default function Overview({ data, goTo }: { data: DashboardData; goTo: (tab: "Review" | "Scam inbox" | "Invoices" | "Demo") => void }) {
  const f = data.forecast;
  const short = f.lowest.balance < 50_000;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-6">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="chart" size={18} className="text-accent" /> Cash flow, next 30 days
              </h2>
              <p className="mt-1 text-sm text-muted">Starting from {money(f.startBalance)} in PayPal. Money in when invoices fall due, money out for open payments and payroll.</p>
            </div>
            <span className={`pill ${short ? "pill-amber" : "pill-green"}`}>
              Lowest: {money(f.lowest.balance)} on {shortDate(f.lowest.day)}
            </span>
          </div>
          <ForecastChart days={f.days} />
          <div className={`mt-4 flex gap-3 rounded-xl p-3 text-sm ${short ? "bg-amber-soft" : "bg-green-soft"}`}>
            <Icon name="sparkles" size={18} className={`mt-0.5 shrink-0 ${short ? "text-amber" : "text-green"}`} />
            <p>
              {short ? (
                <>
                  Cash gets tight around <strong>{shortDate(f.lowest.day)}</strong> ({money(f.lowest.balance)} left).{" "}
                </>
              ) : (
                <>You stay above {money(f.lowest.balance)} all month. </>
              )}
              {f.chase.length > 0 && (
                <>
                  Chase these first: <strong>{f.chase.join("; ")}</strong>.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <QuickAction icon="shieldCheck" title="Review held payments" text={`${data.kpis.heldForReview} waiting`} onClick={() => goTo("Review")} />
          <QuickAction icon="inbox" title="Check a message" text="Is this invoice real?" onClick={() => goTo("Scam inbox")} />
          <QuickAction icon="file" title="New invoice" text="Describe it in a sentence" onClick={() => goTo("Invoices")} />
        </div>
      </section>

      <aside className="space-y-6">
        <div className="card overflow-hidden">
          <div className="bg-hero relative p-5 text-white">
            <div className="bg-hero-dots pointer-events-none absolute inset-0" />
            <div className="relative">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <Icon name="shieldCheck" size={16} /> Protected by Finwarden
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{money(data.kpis.protectedAmount)}</div>
              <div className="text-sm text-white/75">
                held back from {data.kpis.scamsStopped} risky payment{data.kpis.scamsStopped === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="p-4 text-sm text-muted">The AI reads and explains. Rules in code decide, and only your passkey approves.</div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Recent activity</h3>
          <ul className="space-y-3">
            {data.audit.slice(0, 7).map((a) => {
              const [icon, tone] = ACTION_ICON[a.action] ?? (["clock", "accent"] as [IconName, "accent"]);
              return (
                <li key={a.id} className="flex gap-3 text-sm">
                  <IconBadge name={icon} tone={tone} size={14} />
                  <div className="min-w-0">
                    <p className="line-clamp-2">{a.why}</p>
                    <p className="text-xs text-muted">
                      {a.actor} · {dateTime(a.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function QuickAction({ icon, title, text, onClick }: { icon: IconName; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card card-hover group flex items-center gap-3 p-4 text-left">
      <IconBadge name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <Icon name="arrowRight" size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </button>
  );
}

function ForecastChart({ days }: { days: DashboardData["forecast"]["days"] }) {
  const W = 640;
  const H = 190;
  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const values = days.map((d) => d.balance);
  const max = Math.max(...values, 0) * 1.1 || 1;
  const min = Math.min(...values, 0);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (days.length - 1);
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min || 1);
  const line = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(days.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const barMax = Math.max(...days.map((d) => Math.max(d.inflow, d.outflow)), 1);
  const barH = (v: number) => (v / barMax) * 46;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label="Projected balance for the next 30 days">
      <defs>
        <linearGradient id="fw-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={pad.l} x2={W - pad.r} y1={pad.t + t * (H - pad.t - pad.b)} y2={pad.t + t * (H - pad.t - pad.b)} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      {days.map((d, i) => (
        <g key={i}>
          {d.inflow > 0 && <rect x={x(i) - 4} y={H - pad.b - barH(d.inflow)} width="8" height={barH(d.inflow)} rx="2" fill="var(--green)" opacity="0.55" />}
          {d.outflow > 0 && <rect x={x(i) - 4} y={H - pad.b - barH(d.outflow)} width="8" height={barH(d.outflow)} rx="2" fill="var(--red)" opacity="0.5" transform={d.inflow > 0 ? "translate(5,0)" : undefined} />}
          <title>{`${shortDate(d.day)}: balance ${money(d.balance)}${d.events.length ? ` (${d.events.join(", ")})` : ""}`}</title>
        </g>
      ))}
      <path d={area} fill="url(#fw-area)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {[0, 7, 14, 21, 30].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === 30 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
          {shortDate(days[i].day)}
        </text>
      ))}
    </svg>
  );
}
