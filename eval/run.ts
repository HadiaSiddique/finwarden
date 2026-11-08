// Runs the fraud rules over the labelled cases and writes eval/results.md.
// Rules mode (default): uses the labelled message signals, no AI. Runs in CI.
// Usage: npm run eval            (reads eval/cases.json, the frozen set)
//        npm run eval -- --regenerate   (rewrites cases.json from cases.ts; only before any tuning)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NOW } from "../src/trust/fixtures";
import { evaluateMessage, evaluatePayment } from "../src/trust/rules";
import { DEFAULT_THRESHOLDS, type Flag, type PayeeRecord, type PaymentIntent } from "../src/trust/types";
import type { CaseIntent, EvalCase } from "./cases";

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const casesFile = path.join(dir, "cases.json");

async function loadCases(): Promise<EvalCase[]> {
  if (process.argv.includes("--regenerate") || !existsSync(casesFile)) {
    const { CASES } = await import("./cases");
    writeFileSync(casesFile, JSON.stringify(CASES, null, 2) + "\n");
    console.log(`Wrote ${CASES.length} cases to eval/cases.json`);
  }
  return JSON.parse(readFileSync(casesFile, "utf8"));
}

function revive<T>(o: T): T {
  return JSON.parse(JSON.stringify(o), (_k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v));
}

function toIntent(c: CaseIntent, id: string, now: Date, payees: PayeeRecord[]): PaymentIntent {
  const p = payees.find((x) => x.id === c.payeeId);
  const payout = c.payout ?? p?.verifiedPayout ?? { method: "paypal_email", receiver: "unknown@example.com", currency: "USD" };
  return {
    id,
    payeeId: c.payeeId,
    payeeName: c.payeeName,
    amount: c.amount,
    currency: "USD",
    payout,
    invoiceNumber: c.invoiceNumber,
    createdAt: new Date(now.getTime() - (c.hoursAgo ?? 0) * 3_600_000),
    createdBy: "sara",
    status: "PENDING_APPROVAL",
  };
}

export function runCase(c: EvalCase, basePayees: PayeeRecord[]): Flag[] {
  const now = c.now ? new Date(c.now) : NOW;
  let payees = [...basePayees, ...(c.extraPayees ?? []).map(revive)];
  if (c.payeeOverride && c.intent?.payeeId) {
    const o = revive(c.payeeOverride);
    payees = payees.map((p) => (p.id === c.intent!.payeeId ? { ...p, ...o } : p));
  }
  if (c.kind === "message") return evaluateMessage(c.signals!, c.contacts!, payees);
  const intent = toIntent(c.intent!, `${c.id}-now`, now, payees);
  return evaluatePayment({
    now,
    intent,
    payee: payees.find((p) => p.id === intent.payeeId) ?? null,
    allPayees: payees,
    recentIntents: (c.history ?? []).map((h, i) => toIntent(h, `${c.id}-h${i}`, now, payees)),
    thresholds: DEFAULT_THRESHOLDS,
    signals: c.signals,
    messageContacts: c.contacts,
  });
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");

async function main() {
  const { PAYEES } = await import("../src/trust/fixtures");
  const cases = await loadCases();
  const rows = cases.map((c) => {
    const flags = runCase(c, PAYEES);
    const blocked = flags.some((f) => f.severity === "red");
    const warned = !blocked && flags.length > 0;
    return { c, flags, blocked, warned };
  });

  const summary = (split: "train" | "test" | "all") => {
    const r = rows.filter((x) => split === "all" || x.c.split === split);
    const scams = r.filter((x) => x.c.label === "scam");
    const normal = r.filter((x) => x.c.label === "normal");
    const tp = scams.filter((x) => x.blocked).length;
    const fp = normal.filter((x) => x.blocked).length;
    return {
      split, n: r.length, scams: scams.length, normal: normal.length, tp, fn: scams.length - tp, fp, tn: normal.length - fp,
      warnedNormal: normal.filter((x) => x.warned).length,
      catchRate: pct(tp, scams.length), falseAlarm: pct(fp, normal.length),
    };
  };
  const splits = [summary("test"), summary("train"), summary("all")];

  const patterns = [...new Set(rows.map((r) => `${r.c.label}|${r.c.pattern}`))].sort();
  const ruleHits: Record<string, number> = {};
  rows.forEach((r) => r.flags.forEach((f) => (ruleHits[`${f.ruleId} ${f.severity}`] = (ruleHits[`${f.ruleId} ${f.severity}`] ?? 0) + 1)));

  const misses = rows.filter((r) => (r.c.label === "scam" && !r.blocked) || (r.c.label === "normal" && r.blocked));
  const langs = [...new Set(rows.map((r) => r.c.lang))];

  const md = [
    "# Fraud guard evaluation",
    "",
    `Rules mode (labelled message signals, no AI). ${cases.length} synthetic cases built from documented fraud patterns; see \`eval/cases.ts\` for sources.`,
    "A case counts as **blocked** when at least one red flag fires. Amber warnings don't block.",
    "The **test** split (30%) was frozen with a fixed seed before any tuning; report that one.",
    "",
    "## Headline (held-out test split)",
    "",
    `- **Catch rate:** ${splits[0].catchRate} (${splits[0].tp} of ${splits[0].scams} scams blocked)`,
    `- **False-alarm rate:** ${splits[0].falseAlarm} (${splits[0].fp} of ${splits[0].normal} normal cases blocked)`,
    `- Normal cases that got an amber warning only: ${splits[0].warnedNormal}`,
    "",
    "## By split",
    "",
    "| Split | Cases | Scams | Normal | Caught | Missed | False alarms | Catch rate | False-alarm rate |",
    "|---|---|---|---|---|---|---|---|---|",
    ...splits.map((s) => `| ${s.split} | ${s.n} | ${s.scams} | ${s.normal} | ${s.tp} | ${s.fn} | ${s.fp} | ${s.catchRate} | ${s.falseAlarm} |`),
    "",
    "## Confusion matrix (all cases)",
    "",
    "| | Blocked | Not blocked |",
    "|---|---|---|",
    `| Scam | ${splits[2].tp} | ${splits[2].fn} |`,
    `| Normal | ${splits[2].fp} | ${splits[2].tn} |`,
    "",
    "## By pattern (all cases)",
    "",
    "| Label | Pattern | Cases | Blocked | Warned only |",
    "|---|---|---|---|---|",
    ...patterns.map((key) => {
      const [label, pattern] = key.split("|");
      const r = rows.filter((x) => x.c.label === label && x.c.pattern === pattern);
      return `| ${label} | ${pattern} | ${r.length} | ${r.filter((x) => x.blocked).length} | ${r.filter((x) => x.warned).length} |`;
    }),
    "",
    "## Rule hits",
    "",
    "| Rule | Hits |",
    "|---|---|",
    ...Object.entries(ruleHits).sort().map(([k, v]) => `| ${k} | ${v} |`),
    "",
    `Languages in the set: ${langs.join(", ")}.`,
    "",
    "## Misses and false alarms",
    "",
    misses.length ? "| Case | Split | Label | Pattern | Description | Flags |" : "None.",
    misses.length ? "|---|---|---|---|---|---|" : "",
    ...misses.map((r) => `| ${r.c.id} | ${r.c.split} | ${r.c.label} | ${r.c.pattern} | ${r.c.description.replace(/\|/g, "/")} | ${r.flags.map((f) => `${f.ruleId}:${f.severity}`).join(", ") || "none"} |`),
    "",
  ].join("\n");

  writeFileSync(path.join(dir, "results.md"), md);
  console.table(splits);
  console.log(`${misses.length} miss(es) / false alarm(s). Wrote eval/results.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
