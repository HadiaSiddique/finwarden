// Fraud guard rules R1–R9. Each rule is deterministic and explains itself in plain language.
import { payoutFingerprint } from "./hash";
import { domainLooksLike, emailDomain, looksLike, normaliseName } from "./lookalike";
import type {
  Flag,
  MessageContacts,
  MessageSignals,
  PayeeRecord,
  PaymentIntent,
  Thresholds,
} from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface RuleContext {
  now: Date;
  intent: PaymentIntent;
  payee: PayeeRecord | null;
  allPayees: PayeeRecord[];
  // Other intents from the last 90 days, excluding cancelled ones.
  recentIntents: PaymentIntent[];
  thresholds: Thresholds;
  signals?: MessageSignals;
  messageContacts?: MessageContacts;
}

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export function r1PayoutChanged(ctx: RuleContext): Flag | null {
  const { payee, intent } = ctx;
  if (!payee?.verifiedPayout) return null;
  if (payoutFingerprint(intent.payout) === payoutFingerprint(payee.verifiedPayout)) return null;
  return {
    ruleId: "R1",
    severity: "red",
    why: `The payment details for ${payee.name} don't match the details we verified before. Confirm the change using the contact already on file, never one from the new request.`,
    evidence: { verified: payee.verifiedPayout, requested: intent.payout },
  };
}

export function r2Lookalike(ctx: RuleContext): Flag | null {
  const { intent, payee, allPayees } = ctx;
  for (const known of allPayees) {
    if (payee && known.id === payee.id && normaliseName(intent.payeeName) === normaliseName(known.name)) continue;
    const m = looksLike(intent.payeeName, known.name);
    if (m) {
      return {
        ruleId: "R2",
        severity: "red",
        why: `"${intent.payeeName}" looks like your existing payee "${known.name}" but isn't the same name. This is a common trick to divert payments.`,
        evidence: { ...m, knownPayeeId: known.id },
      };
    }
  }
  if (intent.payout.method === "paypal_email" || intent.payout.method === "venmo") {
    const domain = emailDomain(intent.payout.receiver);
    if (domain) {
      const known = allPayees.flatMap((p) => p.contacts.domains.map((d) => ({ d, p })));
      const hit = domainLooksLike(domain, known.map((k) => k.d));
      const owner = known.find((k) => k.d === hit)?.p;
      if (hit && owner && (!payee || !payee.contacts.domains.includes(domain))) {
        return {
          ruleId: "R2",
          severity: "red",
          why: `The receiving address uses "${domain}", which imitates ${owner.name}'s real domain "${hit}".`,
          evidence: { domain, imitates: hit, knownPayeeId: owner.id },
        };
      }
    }
  }
  return null;
}

function normInvoiceNo(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^([a-z]*)0+/, "$1");
}

// The invoice's main number: its longest run of digits, without leading zeros.
function mainNumber(raw: string): string {
  const groups = raw.match(/\d+/g) ?? [];
  return groups.reduce((best, g) => (g.replace(/^0+/, "").length > best.length ? g.replace(/^0+/, "") : best), "");
}

// "INV-1042" vs "INV-1042-A" or "INV-1042/1": same main number, decorated differently, a re-sent copy.
// "H-10" vs "H-11" is just the next invoice in sequence, so it doesn't count.
function isAlteredCopy(rawA: string, rawB: string): boolean {
  const a = mainNumber(rawA);
  return a.length >= 3 && a === mainNumber(rawB) && normInvoiceNo(rawA) !== normInvoiceNo(rawB);
}

export function r3Duplicate(ctx: RuleContext): Flag | null {
  const { intent, recentIntents, now, thresholds } = ctx;
  const samePayee = recentIntents.filter(
    (o) =>
      o.id !== intent.id &&
      (intent.payeeId ? o.payeeId === intent.payeeId : normaliseName(o.payeeName) === normaliseName(intent.payeeName)),
  );
  const inv = intent.invoiceNumber ? normInvoiceNo(intent.invoiceNumber) : null;
  for (const o of samePayee) {
    const oInv = o.invoiceNumber ? normInvoiceNo(o.invoiceNumber) : null;
    if (inv && oInv && inv === oInv) {
      return {
        ruleId: "R3",
        severity: "red",
        why: `Invoice ${intent.invoiceNumber} from ${intent.payeeName} has already been queued or paid.`,
        evidence: { duplicateOf: o.id, invoiceNumber: intent.invoiceNumber },
      };
    }
    const ageDays = (now.getTime() - o.createdAt.getTime()) / DAY;
    if (o.amount === intent.amount && o.currency === intent.currency && ageDays <= thresholds.duplicateWindowDays) {
      if (intent.invoiceNumber && o.invoiceNumber && isAlteredCopy(intent.invoiceNumber, o.invoiceNumber)) {
        return {
          ruleId: "R3",
          severity: "red",
          why: `This looks like a re-sent copy of invoice ${o.invoiceNumber}: same payee, same amount, almost the same invoice number.`,
          evidence: { duplicateOf: o.id, invoiceNumbers: [o.invoiceNumber, intent.invoiceNumber] },
        };
      }
      if (ageDays <= 7) {
        return {
          ruleId: "R3",
          severity: "amber",
          why: `${intent.payeeName} was already sent ${money(o.amount, o.currency)} ${ageDays < 1 ? "earlier today" : `${Math.round(ageDays)} day${Math.round(ageDays) === 1 ? "" : "s"} ago`}. Check this isn't a double payment.`,
          evidence: { possibleDuplicateOf: o.id },
        };
      }
    }
  }
  return null;
}

export function r4Split(ctx: RuleContext): Flag | null {
  const { intent, recentIntents, now, thresholds } = ctx;
  const receiver = payoutFingerprint(intent.payout);
  const windowStart = now.getTime() - thresholds.splitWindowHours * HOUR;
  const group = [
    intent,
    ...recentIntents.filter(
      (o) =>
        o.id !== intent.id &&
        o.currency === intent.currency &&
        o.createdAt.getTime() >= windowStart &&
        ((intent.payeeId && o.payeeId === intent.payeeId) || payoutFingerprint(o.payout) === receiver),
    ),
  ];
  if (group.length < 2) return null;
  if (!group.every((g) => g.amount < thresholds.twoApproverMinor)) return null;
  const total = group.reduce((s, g) => s + g.amount, 0);
  if (total < thresholds.twoApproverMinor) return null;
  return {
    ruleId: "R4",
    severity: "red",
    why: `${group.length} payments to the same recipient in ${thresholds.splitWindowHours} hours add up to ${money(total, intent.currency)}. Each is just under the two-person approval limit, a pattern used to dodge checks.`,
    evidence: { intentIds: group.map((g) => g.id), total },
  };
}

function daysUntilPayday(now: Date, day: number): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let next = Date.UTC(y, m, day);
  if (next < Date.UTC(y, m, now.getUTCDate())) next = Date.UTC(y, m + 1, day);
  return Math.round((next - Date.UTC(y, m, now.getUTCDate())) / DAY);
}

export function r5PayrollDiversion(ctx: RuleContext): Flag | null {
  const { payee, intent, now, thresholds } = ctx;
  if (payee?.type !== "employee" || payee.paydayDayOfMonth == null) return null;
  const changedNow = payee.verifiedPayout && payoutFingerprint(intent.payout) !== payoutFingerprint(payee.verifiedPayout);
  const changedRecently =
    payee.payoutVerifiedAt && now.getTime() - payee.payoutVerifiedAt.getTime() <= thresholds.paydayWindowDays * DAY && payee.firstPaidAt;
  if (!changedNow && !changedRecently) return null;
  const until = daysUntilPayday(now, payee.paydayDayOfMonth);
  if (until > thresholds.paydayWindowDays) return null;
  return {
    ruleId: "R5",
    severity: "red",
    why: `${payee.name}'s bank details changed ${until} day(s) before payday. Payroll scammers swap accounts right before payday. Confirm with ${payee.name} in person or on their saved number.`,
    evidence: { daysUntilPayday: until },
  };
}

export function r6NewPayee(ctx: RuleContext): Flag | null {
  const { payee, intent, thresholds } = ctx;
  if (payee?.firstPaidAt) return null;
  return {
    ruleId: "R6",
    severity: "amber",
    why: `This is the first payment to ${payee?.name ?? intent.payeeName}. New payees wait ${thresholds.coolingOffHours} hours before money can go out.`,
    evidence: { payeeId: payee?.id ?? null },
  };
}

export function r7Pressure(ctx: RuleContext): Flag | null {
  const s = ctx.signals;
  if (!s) return null;
  return pressureFlag(s, !ctx.payee?.firstPaidAt || s.paymentDetailsChange || r1PayoutChanged(ctx) !== null);
}

// `risky`: the money would go somewhere new or changed.
export function pressureFlag(s: MessageSignals, risky: boolean): Flag | null {
  const count = [s.urgency, s.authorityClaim, s.secrecyRequest, s.offChannelRequest, s.paymentDetailsChange].filter(Boolean).length;
  const named = s.claimedSender ? ` claiming to be ${s.claimedSender}` : "";
  const traits = [
    s.urgency && "urgency",
    s.authorityClaim && "a claim of authority",
    s.secrecyRequest && "a request for secrecy",
    s.offChannelRequest && "a push to move off normal channels",
    s.paymentDetailsChange && "new payment details",
  ].filter(Boolean);
  if ((s.authorityClaim && s.urgency && risky) || (s.secrecyRequest && s.paymentDetailsChange) || count >= 3) {
    return {
      ruleId: "R7",
      severity: "red",
      why: `The request${named} uses ${traits.join(", ")}. This is how impersonation scams (like the $25M deepfake CFO case) push people to pay fast.`,
      evidence: { signals: s },
    };
  }
  if (s.urgency || s.authorityClaim) {
    return { ruleId: "R7", severity: "amber", why: `The request${named} uses ${traits.join(", ")}. Take a moment before paying.`, evidence: { signals: s } };
  }
  return null;
}

export function normalisePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.slice(-10);
}

// R8 works on a message on its own (scam inbox) or attached to a payment.
export function contactMismatch(
  contacts: MessageContacts,
  claimedSender: string | null,
  allPayees: PayeeRecord[],
): Flag | null {
  const claimsPayPal = !!claimedSender && /pay\s*pal/i.test(claimedSender);
  if (claimsPayPal && contacts.phones.length) {
    return {
      ruleId: "R8",
      severity: "red",
      why: `This message claims to be from PayPal but asks you to call ${contacts.phones[0]}. Real PayPal invoices are sometimes abused this way: scammers put their own number in the note. Don't call it; check your account at paypal.com instead.`,
      evidence: { phones: contacts.phones },
    };
  }
  if (!claimedSender) return null;
  // "Acme Accounts" or "Acme Ltd billing" both claim to be the payee "Acme Ltd".
  const claimed = normaliseName(claimedSender);
  const sender = allPayees.find((p) => {
    const n = normaliseName(p.name);
    return n === claimed || (n.length >= 4 && claimed.includes(n)) || (claimed.length >= 4 && n.includes(claimed));
  });
  if (!sender) return null;
  const knownPhones = new Set(sender.contacts.phones.map(normalisePhone));
  const knownEmails = new Set(sender.contacts.emails.map((e) => e.toLowerCase()));
  const knownDomains = new Set(sender.contacts.domains.map((d) => d.toLowerCase()));
  const badPhone = contacts.phones.find((p) => !knownPhones.has(normalisePhone(p)));
  const badEmail = contacts.emails.find((e) => {
    const d = emailDomain(e);
    return !knownEmails.has(e.toLowerCase()) && !(d && knownDomains.has(d));
  });
  const badUrl = contacts.urls.find((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      return ![...knownDomains].some((d) => host === d || host.endsWith("." + d));
    } catch {
      return true;
    }
  });
  const bad = badPhone ?? badEmail ?? badUrl;
  if (!bad) return null;
  return {
    ruleId: "R8",
    severity: "red",
    why: `This message says it's from ${sender.name}, but "${bad}" isn't one of their contacts on file. Reach them on the contact you already have.`,
    evidence: { claimedSender, unknownContact: bad, payeeId: sender.id },
  };
}

export function r8ContactMismatch(ctx: RuleContext): Flag | null {
  if (!ctx.messageContacts) return null;
  return contactMismatch(ctx.messageContacts, ctx.signals?.claimedSender ?? null, ctx.allPayees);
}

export function r9AmountAnomaly(ctx: RuleContext): Flag | null {
  const t = ctx.payee?.typicalAmount;
  if (!t) return null;
  if (ctx.intent.amount <= 3 * t.median || ctx.intent.amount <= 1.5 * t.max) return null;
  return {
    ruleId: "R9",
    severity: "amber",
    why: `${money(ctx.intent.amount, ctx.intent.currency)} is far above what you usually pay ${ctx.payee!.name} (typically ${money(t.median, ctx.intent.currency)}).`,
    evidence: { amount: ctx.intent.amount, typical: t },
  };
}

export const PAYMENT_RULES = [
  r1PayoutChanged,
  r2Lookalike,
  r3Duplicate,
  r4Split,
  r5PayrollDiversion,
  r6NewPayee,
  r7Pressure,
  r8ContactMismatch,
  r9AmountAnomaly,
];

export function evaluatePayment(ctx: RuleContext): Flag[] {
  return PAYMENT_RULES.map((rule) => rule(ctx)).filter((f): f is Flag => f !== null);
}

// Scam inbox: a message on its own, with no payment attached yet.
export function evaluateMessage(signals: MessageSignals, contacts: MessageContacts, allPayees: PayeeRecord[]): Flag[] {
  return [
    contactMismatch(contacts, signals.claimedSender, allPayees),
    pressureFlag(signals, signals.paymentDetailsChange || signals.offChannelRequest),
  ].filter((f): f is Flag => f !== null);
}
