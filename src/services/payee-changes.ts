// Payee detail changes never come straight from a message. They wait for a callback
// to the contact already on file, then the cooling-off period starts.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { PayoutDetails } from "@/trust/types";
import { TrustError, audit, newId, now } from "./core";
import { recheckIntent } from "./intents";

export async function requestPayeeChange(
  payeeId: string,
  requestedPayout: PayoutDetails,
  source: "message" | "user",
  actor: { type: "user" | "agent" | "system"; id: string },
  sourceText?: string,
) {
  const db = await getDb();
  const [payee] = await db.select().from(schema.payees).where(eq(schema.payees.id, payeeId));
  if (!payee) throw new TrustError("Payee not found.");
  const callback = payee.contacts.phones[0] ?? payee.contacts.emails[0] ?? null;
  const id = newId("pc");
  await db.insert(schema.payeeChangeRequests).values({
    id,
    payeeId,
    requestedPayout,
    source,
    sourceText,
    status: "PENDING_CALLBACK",
    callbackContact: callback,
    createdAt: await now(),
  });
  await audit({
    actorType: actor.type,
    actorId: actor.id,
    action: "payee_change.requested",
    subjectType: "payee",
    subjectId: payeeId,
    ruleIds: ["R1"],
    why: `A request to change ${payee.name}'s payment details was received${source === "message" ? " in a message" : ""}. Nothing changes until someone confirms it by contacting ${payee.name} on ${callback ?? "a contact on file"}.`,
    data: { requestId: id },
  });
  return { id, callbackContact: callback };
}

// The user confirms they reached the payee on the saved contact and the payee confirmed the change.
export async function confirmPayeeChange(requestId: string, userId: string, confirmed: boolean) {
  const db = await getDb();
  const [req] = await db.select().from(schema.payeeChangeRequests).where(eq(schema.payeeChangeRequests.id, requestId));
  if (!req || req.status !== "PENDING_CALLBACK") throw new TrustError("This change request is not waiting for a callback.");
  const at = await now();
  await db
    .update(schema.payeeChangeRequests)
    .set({ status: confirmed ? "VERIFIED" : "REJECTED", decidedBy: userId, decidedAt: at })
    .where(eq(schema.payeeChangeRequests.id, requestId));

  const [payee] = await db.select().from(schema.payees).where(eq(schema.payees.id, req.payeeId));
  if (confirmed) {
    await db
      .update(schema.payees)
      .set({ verifiedPayout: req.requestedPayout, payoutVerifiedAt: at })
      .where(eq(schema.payees.id, req.payeeId));
  }
  await audit({
    actorType: "user",
    actorId: userId,
    action: confirmed ? "payee_change.verified" : "payee_change.rejected",
    subjectType: "payee",
    subjectId: req.payeeId,
    ruleIds: ["R1"],
    why: confirmed
      ? `${payee?.name} confirmed the new details on ${req.callbackContact}. New details are saved; payments to them wait out the cooling-off period.`
      : `${payee?.name} did not confirm the change on ${req.callbackContact}. The request was rejected; this is likely a scam.`,
  });

  // Re-check open payments to this payee: R1 clears only if the payment now matches the verified details.
  const open = await db
    .select({ id: schema.paymentIntents.id })
    .from(schema.paymentIntents)
    .where(and(eq(schema.paymentIntents.payeeId, req.payeeId), inArray(schema.paymentIntents.status, ["PENDING_APPROVAL", "APPROVED"])));
  for (const o of open) await recheckIntent(o.id, { type: "system", id: "payee-change" });
}
