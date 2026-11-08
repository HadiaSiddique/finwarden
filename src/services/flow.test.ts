// End-to-end trust flow against a real (in-memory) Postgres, with the PayPal stub.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, schema, setDb, type DB } from "@/db";
import { resetAndSeed } from "@/db/seed";
import { executeIntents } from "@/trust/executor";
import { intentHash } from "@/trust/hash";
import { advanceClock } from "./core";
import { acknowledgeFlag, createIntent, intentStatusView, recordVerifiedApproval, resolveFlag } from "./intents";
import { confirmPayeeChange, requestPayeeChange } from "./payee-changes";
import { loadIntent } from "./repo";

let db: DB;
const sara = { type: "user" as const, id: "sara" };

beforeEach(async () => {
  process.env.DEMO_MODE = "true";
  process.env.PAYPAL_MODE = "stub";
  db = await createPgliteDb(":memory:");
  setDb(db);
  await resetAndSeed(db);
});

async function approveAs(intentId: string, userId: string) {
  const intent = await loadIntent(intentId);
  await recordVerifiedApproval(intentId, userId, intentHash(intent!));
}

describe("payment flow", () => {
  it("sends a clean payment after one passkey approval", async () => {
    const { id, flags } = await createIntent({ payeeId: "acme", payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "A-77" }, sara);
    expect(flags).toEqual([]);
    expect((await executeIntents([id], "sara")).refused).toHaveLength(1);
    await approveAs(id, "sara");
    const res = await executeIntents([id], "sara");
    expect(res.sent).toEqual([id]);
    expect(res.batch?.stub).toBe(true);
    expect((await loadIntent(id))?.status).toBe("SENT");
    // Never twice.
    expect((await executeIntents([id], "sara")).sent).toEqual([]);
  });

  it("needs a second person above $1,000", async () => {
    const { id } = await createIntent({ payeeId: "acme", payeeName: "Acme Ltd", amount: 120_000, invoiceNumber: "A-78" }, sara);
    await acknowledgeFlag((await intentStatusView(id))!.flags.find((f) => f.ruleId === "R9")?.id ?? "", "sara").catch(() => {});
    await approveAs(id, "sara");
    await expect(approveAs(id, "sara")).rejects.toThrow(/second person/);
    expect((await executeIntents([id], "sara")).sent).toEqual([]);
    await approveAs(id, "omar");
    expect((await executeIntents([id], "omar")).sent).toEqual([id]);
  });

  it("holds a 'we changed our bank details' payment until verified on the saved contact", async () => {
    const newDetails = { method: "paypal_email" as const, receiver: "acme.payments@example.net", currency: "USD" };
    const { id: changeId, callbackContact } = await requestPayeeChange("acme", newDetails, "message", { type: "agent", id: "inbox" }, "We changed our bank details");
    expect(callbackContact).toBe("+1 415 555 0100");
    const { id, flags } = await createIntent({ payeeId: "acme", payeeName: "Acme Ltd", amount: 60_000, payout: newDetails, invoiceNumber: "A-79" }, sara);
    expect(flags.map((f) => f.ruleId)).toContain("R1");
    await expect(approveAs(id, "sara")).rejects.toThrow(/red flags/);
    await expect(resolveFlag((await intentStatusView(id))!.flags[0].id, "sara", "I trust this email")).rejects.toThrow(/contact on file/);

    // Sara calls Acme on the saved number; they confirm. R1 clears, cooling-off starts.
    await confirmPayeeChange(changeId, "sara", true);
    const view = await intentStatusView(id);
    expect(view!.flags.find((f) => f.ruleId === "R1")?.resolvedBy).toBe("system");
    await approveAs(id, "sara");
    const blocked = await executeIntents([id], "sara");
    expect(blocked.refused[0].reasons.join(" ")).toMatch(/Cooling-off/);

    await advanceClock(25, "sara");
    expect((await executeIntents([id], "sara")).sent).toEqual([id]);
  });

  it("keeps the payment blocked when the payee denies the change", async () => {
    const scam = { method: "paypal_email" as const, receiver: "acme@acme-billing.example", currency: "USD" };
    const { id: changeId } = await requestPayeeChange("acme", scam, "message", { type: "agent", id: "inbox" });
    const { id } = await createIntent({ payeeId: "acme", payeeName: "Acme Ltd", amount: 60_000, payout: scam }, sara);
    await confirmPayeeChange(changeId, "sara", false);
    const view = await intentStatusView(id);
    expect(view!.flags.filter((f) => !f.resolvedAt).map((f) => f.ruleId)).toEqual(expect.arrayContaining(["R1", "R2"]));
  });

  it("voids approvals if the amount is changed behind the app's back", async () => {
    const { id } = await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 20_000 }, sara);
    await approveAs(id, "sara");
    await db.update(schema.paymentIntents).set({ amount: 99_000 }).where(sql`id = ${id}`);
    const res = await executeIntents([id], "sara");
    expect(res.sent).toEqual([]);
    expect(res.refused[0].reasons.join(" ")).toMatch(/Needs 1 passkey approval/);
  });

  it("fails closed when PayPal errors", async () => {
    const { id } = await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 20_000 }, sara);
    await approveAs(id, "sara");
    const failing = vi.fn().mockRejectedValue(new Error("PayPal is down"));
    const res = await executeIntents([id], "sara", failing);
    expect(res.error).toMatch(/down/);
    expect((await loadIntent(id))?.status).toBe("FAILED");
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 20_000 }, sara);
    await expect(db.execute(sql`UPDATE audit_events SET why = 'edited'`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM audit_events`)).rejects.toThrow();
    const rows = await db.select().from(schema.auditEvents);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.why.length > 0)).toBe(true);
  });
});
