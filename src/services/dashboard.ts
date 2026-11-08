// Read models for the dashboard.
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { resetAndSeed } from "@/db/seed";
import { usingStub } from "@/paypal/mode";
import { coolingOffEndsAt, requiredApprovers, validApprovals } from "@/trust/policy";
import { demoMode, now } from "./core";
import { thresholds, toFlag, toIntent, toPayee } from "./repo";

const DAY = 86_400_000;

export async function ensureSeeded() {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  if (count === 0 && demoMode()) await resetAndSeed(db);
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
    },
    invoices,
    intents,
    payees: payeeRows,
    changeRequests: changeRows.map((c) => ({ ...c, payee: payees.find((p) => p.id === c.payeeId)?.name ?? c.payeeId })),
    audit: auditRows.map((a) => ({ ...a, actor: userName.get(a.actorId) ?? a.actorId })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
