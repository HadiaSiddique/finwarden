// Small shared services: ids, the (demo-adjustable) clock, and the audit log.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

// The demo clock lets judges fast-forward through cooling-off periods. It only exists in demo mode.
export async function now(): Promise<Date> {
  if (!demoMode()) return new Date();
  const db = await getDb();
  const [row] = await db.select().from(schema.demoState).where(eq(schema.demoState.id, "singleton"));
  return new Date(Date.now() + (row?.clockOffsetMs ?? 0));
}

export async function advanceClock(hours: number, actorId: string) {
  if (!demoMode()) throw new Error("The demo clock only exists in demo mode.");
  const db = await getDb();
  const [row] = await db.select().from(schema.demoState).where(eq(schema.demoState.id, "singleton"));
  const offset = (row?.clockOffsetMs ?? 0) + hours * 3_600_000;
  await db
    .insert(schema.demoState)
    .values({ id: "singleton", clockOffsetMs: offset })
    .onConflictDoUpdate({ target: schema.demoState.id, set: { clockOffsetMs: offset } });
  await audit({
    actorType: "user",
    actorId,
    action: "demo.clock_advanced",
    subjectType: "demo",
    subjectId: "clock",
    why: `Demo clock moved forward ${hours} hours (demo mode only).`,
    data: { hours, offsetMs: offset },
  });
}

export type AuditInput = Omit<typeof schema.auditEvents.$inferInsert, "id" | "at"> & { at?: Date };

export async function audit(event: AuditInput) {
  const db = await getDb();
  await db.insert(schema.auditEvents).values({ ...event, at: event.at ?? (await now()) });
}

export class TrustError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[] = [],
  ) {
    super(message);
  }
}
