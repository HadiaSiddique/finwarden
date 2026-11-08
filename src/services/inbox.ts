// Scam inbox: paste any invoice, money request or payment email and get a verdict.
// The AI extracts signals; the rules decide; contacts are parsed by code.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { extractMessage, parseContacts, toSignals, type ExtractedMessage } from "@/ai/extract";
import { evaluateMessage } from "@/trust/rules";
import type { Flag, MessageSignals } from "@/trust/types";
import { audit, newId, now } from "./core";
import { loadAllPayees } from "./repo";

const calm: MessageSignals = { urgency: false, authorityClaim: false, secrecyRequest: false, offChannelRequest: false, paymentDetailsChange: false, claimedSender: null };

export interface InboxVerdict {
  id: string;
  verdict: "safe" | "suspicious" | "scam";
  flags: Flag[];
  extracted: ExtractedMessage | null;
  aiAvailable: boolean;
}

export async function analyseMessage(text: string, userId: string, sessionId?: string): Promise<InboxVerdict> {
  const db = await getDb();
  const extracted = await extractMessage(text, sessionId);
  const contacts = extracted?.contacts ?? parseContacts(text);
  // Without the AI, the contact rules still run on parsed contacts; the sender is unknown.
  const signals = extracted ? toSignals(extracted) : calm;
  const flags = evaluateMessage(signals, contacts, await loadAllPayees());
  const verdict = flags.some((f) => f.severity === "red") ? "scam" : flags.length ? "suspicious" : "safe";

  const id = newId("ib");
  const at = await now();
  await db.insert(schema.inboxItems).values({
    id,
    kind: extracted?.kind ?? "other",
    rawText: text,
    signals,
    contacts,
    verdict,
    createdBy: userId,
    createdAt: at,
  });
  if (flags.length) await db.insert(schema.flags).values(flags.map((f) => ({ ...f, id: newId("fl"), inboxItemId: id, createdAt: at })));
  await audit({
    actorType: "agent",
    actorId: "fraud-guard",
    action: "inbox.checked",
    subjectType: "inbox_item",
    subjectId: id,
    ruleIds: flags.map((f) => f.ruleId),
    why:
      verdict === "safe"
        ? "Checked the message: no warning signs found."
        : `Checked the message: ${verdict === "scam" ? "likely scam" : "suspicious"}. ${flags.map((f) => f.why).join(" ")}`,
    data: { ai: extracted?.ai ?? null, summary: extracted?.summary ?? null },
  });
  return { id, verdict, flags, extracted, aiAvailable: !!extracted };
}

export async function recentInbox(limit = 20) {
  const db = await getDb();
  const items = await db.select().from(schema.inboxItems).orderBy(desc(schema.inboxItems.createdAt)).limit(limit);
  const out = [];
  for (const item of items) {
    const flags = await db.select().from(schema.flags).where(eq(schema.flags.inboxItemId, item.id));
    out.push({ ...item, flags });
  }
  return out;
}
