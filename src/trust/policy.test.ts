import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACME, NOW, daysAgo, intent, payee } from "./fixtures";
import { intentHash } from "./hash";
import { checkExecution } from "./policy";
import { DEFAULT_THRESHOLDS, type Approval, type PaymentIntent, type StoredFlag } from "./types";

function approve(i: PaymentIntent, userId: string, over: Partial<Approval> = {}): Approval {
  return { id: `ap_${userId}`, intentId: i.id, userId, intentHash: intentHash(i), passkeyVerified: true, createdAt: NOW, ...over };
}

function check(i: PaymentIntent, approvals: Approval[], flags: StoredFlag[] = [], p = ACME, now = NOW) {
  return checkExecution({ intent: i, payee: p, flags, approvals, now, thresholds: DEFAULT_THRESHOLDS });
}

const approved = (amount: number) => intent({ payeeName: "Acme Ltd", amount, status: "APPROVED" });

describe("trust layer invariants", () => {
  it("allows an approved small payment with one passkey approval", () => {
    const i = approved(60_000);
    expect(check(i, [approve(i, "sara")]).ok).toBe(true);
  });

  it("refuses anything not in APPROVED status", () => {
    const i = intent({ payeeName: "Acme Ltd", amount: 60_000 });
    expect(check(i, [approve(i, "sara")]).ok).toBe(false);
  });

  it("refuses approvals without a verified passkey", () => {
    const i = approved(60_000);
    expect(check(i, [approve(i, "sara", { passkeyVerified: false })]).ok).toBe(false);
  });

  it("voids approvals when the amount changes after approval", () => {
    const i = approved(60_000);
    const a = approve(i, "sara");
    expect(check({ ...i, amount: 61_000 }, [a]).ok).toBe(false);
  });

  it("voids approvals when the payout details change after approval", () => {
    const i = approved(60_000);
    const a = approve(i, "sara");
    const swapped = { ...i, payout: { ...i.payout, receiver: "billing@acrne.com" } };
    const r = check(swapped, [a]);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/differ from the payee's verified/);
  });

  it("needs two different people above the threshold", () => {
    const i = approved(150_000);
    expect(check(i, [approve(i, "sara")]).ok).toBe(false);
    expect(check(i, [approve(i, "sara"), approve(i, "sara", { id: "ap_dup" })]).ok).toBe(false);
    expect(check(i, [approve(i, "sara"), approve(i, "omar")]).ok).toBe(true);
  });

  it("blocks on any unresolved red flag", () => {
    const i = approved(60_000);
    const red: StoredFlag = { id: "f1", ruleId: "R2", severity: "red", why: "lookalike", evidence: {} };
    expect(check(i, [approve(i, "sara")], [red]).ok).toBe(false);
    expect(check(i, [approve(i, "sara")], [{ ...red, resolvedBy: "sara", resolvedAt: NOW }]).ok).toBe(true);
  });

  it("needs amber flags acknowledged", () => {
    const i = approved(60_000);
    const amber: StoredFlag = { id: "f2", ruleId: "R9", severity: "amber", why: "high", evidence: {} };
    expect(check(i, [approve(i, "sara")], [amber]).ok).toBe(false);
    expect(check(i, [approve(i, "sara")], [{ ...amber, acknowledgedBy: "sara", acknowledgedAt: NOW }]).ok).toBe(true);
  });

  it("enforces cooling-off for new payees and changed details", () => {
    const fresh = payee({ id: "acme", name: "Acme Ltd", firstPaidAt: null, createdAt: daysAgo(0.5), payoutVerifiedAt: daysAgo(0.5), verifiedPayout: ACME.verifiedPayout });
    const i = approved(60_000);
    expect(check(i, [approve(i, "sara")], [], fresh).ok).toBe(false);
    expect(check(i, [approve(i, "sara")], [], fresh, new Date(NOW.getTime() + 13 * 3_600_000)).ok).toBe(true);

    const changed = { ...ACME, payoutVerifiedAt: daysAgo(0.2) };
    expect(check(i, [approve(i, "sara")], [], changed).ok).toBe(false);
  });

  it("refuses payments to unsaved payees", () => {
    const i = approved(60_000);
    expect(checkExecution({ intent: i, payee: null, flags: [], approvals: [approve(i, "sara")], now: NOW, thresholds: DEFAULT_THRESHOLDS }).ok).toBe(false);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("code boundaries", () => {
  const src = join(__dirname, "..");

  it("keeps AI out of the trust layer", () => {
    for (const f of files(join(src, "trust"))) {
      const code = readFileSync(f, "utf8");
      expect(code, f).not.toMatch(/from ["'](@\/ai|\.\.\/ai|@anthropic-ai|ai["'/]|@ai-sdk)/);
    }
  });

  it("lets only the executor import the Payouts client", () => {
    for (const f of files(src)) {
      if (f.endsWith(join("trust", "executor.ts")) || f.includes(join("paypal", "payouts"))) continue;
      expect(readFileSync(f, "utf8"), f).not.toMatch(/paypal\/payouts/);
    }
  });
});
