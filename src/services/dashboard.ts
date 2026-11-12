// Read models for the dashboard.
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { resetAndSeed } from "@/db/seed";
import { usingStub } from "@/paypal/mode";
import { coolingOffEndsAt, requiredApprovers, validApprovals } from "@/trust/policy";
import { demoMode, now } from "./core";
import { thresholds, toFlag, toIntent, toPayee } from "./repo";

const DAY = 86_400_000;

// Single-flight: concurrent first requests share one seeding run.
let seeding: Promise<void> | null = null;

export async function ensureSeeded() {
  if (!demoMode()) return;
  seeding ??= (async () => {
    const db = await getDb();
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
    if (count === 0) await resetAndSeed(db);
  })().catch((e) => {
    seeding = null;
    throw e;
  });
  return seeding;
}

export async function dashboardData() {
  await ensureSeeded();
  const db = await getDb();
  const at = await now();
  const [clientRows, invoiceRows, payeeRows, intentRows, flagRows, approvalRows, changeRows, auditRows, userRows] = await Promise.all([
    db.select().from(schema.clients),
    db.select().from(schema.invoices),
    db.select().from(schema.payees),
    db.select().from(schema.paymentIntents).orderBy(desc(schema.paymentIntents.createdAt)),
    db.select().from(schema.flags),
    db.select().from(schema.approvals),
    db.select().from(schema.payeeChangeRequests).orderBy(desc(schema.payeeChangeRequests.createdAt)),
    db.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.id)).limit(200),
    db.select().from(schema.users),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const userName = new Map(userRows.map((u) => [u.id, u.name]));
  const payees = payeeRows.map(toPayee);
  const t = thresholds();

  const invoices = invoiceRows.map((i) => {
    const daysOverdue = i.status !== "PAID" && i.status !== "CANCELLED" ? Math.max(0, Math.floor((at.getTime() - i.dueAt.getTime()) / DAY)) : 0;
    return { ...i, client: clientName.get(i.clientId) ?? i.clientId, daysOverdue };
  });

  const intents = intentRows.map((r) => {
    const intent = toIntent(r);
    const flags = flagRows.filter((f) => f.intentId === r.id).map(toFlag);
    const open = flags.filter((f) => !f.resolvedAt && !(f.severity === "amber" && f.acknowledgedAt));
    const approvers = validApprovals(intent, approvalRows.filter((a) => a.intentId === r.id)).map((a) => userName.get(a.userId) ?? a.userId);
    const payee = payees.find((p) => p.id === r.payeeId) ?? null;
    const coolingOff = coolingOffEndsAt(payee, t);
    return {
      ...r,
      flags,
      openRed: open.filter((f) => f.severity === "red").length,
      openAmber: open.filter((f) => f.severity === "amber").length,
      approvers,
      requiredApprovers: requiredApprovers(intent, t),
      coolingOffEndsAt: coolingOff && coolingOff > at ? coolingOff : null,
    };
  });

  const owed = invoices.filter((i) => i.status === "SENT" || i.status === "PARTIALLY_PAID");
  const weekAhead = at.getTime() + 7 * DAY;

  // 30-day cash forecast. Deterministic: invoices arrive on their due date (overdue ones assumed
  // 5 days late from today), open payments leave in 2 days, payroll leaves on payday.
  const START_BALANCE = 142_000; // demo PayPal balance
  const dayIndex = (d: Date) => Math.max(0, Math.floor((d.getTime() - at.getTime()) / DAY));
  const days = Array.from({ length: 31 }, (_, i) => ({ day: new Date(at.getTime() + i * DAY), inflow: 0, outflow: 0, balance: 0, events: [] as string[] }));
  for (const inv of owed) {
    const idx = Math.min(30, inv.daysOverdue > 0 ? 5 : dayIndex(inv.dueAt));
    days[idx].inflow += inv.amount;
    days[idx].events.push(`+${inv.client}`);
  }
  // Held payments (open red flags) won't go out, so they don't count against the balance.
  for (const i of intents.filter((x) => (x.status === "PENDING_APPROVAL" || x.status === "APPROVED") && x.openRed === 0)) {
    const idx = Math.min(30, i.scheduledFor ? dayIndex(i.scheduledFor) : 2);
    days[idx].outflow += i.amount;
    days[idx].events.push(`-${i.payeeName}`);
  }
  for (const p of payees.filter((x) => x.type === "employee" && x.paydayDayOfMonth && x.typicalAmount)) {
    for (let i = 0; i <= 30; i++) {
      if (days[i].day.getUTCDate() === p.paydayDayOfMonth) {
        days[i].outflow += p.typicalAmount!.median;
        days[i].events.push(`-${p.name} (salary)`);
      }
    }
  }
  let running = START_BALANCE;
  for (const d of days) {
    running += d.inflow - d.outflow;
    d.balance = running;
  }
  const lowest = days.reduce((a, b) => (b.balance < a.balance ? b : a));
  const overdue = owed.filter((i) => i.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const chase = overdue.slice(0, 3).map((i) => `${i.client} (${i.number}, ${i.daysOverdue} days late)`);

  const heldIntents = intents.filter((i) => i.flags.some((f) => f.severity === "red"));
  const protectedAmount = heldIntents.filter((i) => i.status !== "SENT").reduce((s, i) => s + i.amount, 0);

  return {
    now: at,
    demoMode: demoMode(),
    paypalStub: usingStub(),
    thresholds: t,
    kpis: {
      owedToYou: owed.reduce((s, i) => s + i.amount, 0),
      overdue: owed.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.amount, 0),
      dueOutThisWeek: intents
        .filter((i) => ["PENDING_APPROVAL", "APPROVED"].includes(i.status) && (!i.scheduledFor || i.scheduledFor.getTime() <= weekAhead))
        .reduce((s, i) => s + i.amount, 0),
      heldForReview: intents.filter((i) => i.status === "PENDING_APPROVAL" && i.openRed > 0).length,
      protectedAmount,
      scamsStopped: heldIntents.length,
    },
    forecast: {
      startBalance: START_BALANCE,
      days: days.map((d) => ({ day: d.day, inflow: d.inflow, outflow: d.outflow, balance: d.balance, events: d.events })),
      lowest: { day: lowest.day, balance: lowest.balance },
      chase,
    },
    invoices,
    intents,
    payees: payeeRows,
    changeRequests: changeRows.map((c) => ({ ...c, payee: payees.find((p) => p.id === c.payeeId)?.name ?? c.payeeId })),
    audit: auditRows.map((a) => ({ ...a, actor: userName.get(a.actorId) ?? a.actorId })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
