// Clients pay invoices through PayPal Checkout. An invoice is marked paid only when PayPal
// reports a COMPLETED capture for the exact amount: never from a "you've been paid" email.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { captureOrder, createOrder } from "@/paypal/orders";
import { money } from "@/trust/rules";
import { TrustError, audit, now } from "./core";

async function payableInvoice(invoiceId: string) {
  const db = await getDb();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv) throw new TrustError("Invoice not found.");
  if (inv.status === "PAID") throw new TrustError("This invoice is already paid.");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  return { inv, client };
}

export async function invoiceForPayment(invoiceId: string) {
  const db = await getDb();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  return { number: inv.number, description: inv.description, amount: inv.amount, currency: inv.currency, status: inv.status, client: client?.name ?? "", dueAt: inv.dueAt };
}

export async function startCheckout(invoiceId: string) {
  const { inv } = await payableInvoice(invoiceId);
  const order = await createOrder(inv.id, inv.amount, inv.currency, `Sara's Studio invoice ${inv.number}: ${inv.description}`);
  await audit({
    actorType: "paypal",
    actorId: "checkout",
    action: "checkout.order_created",
    subjectType: "invoice",
    subjectId: inv.id,
    why: `A PayPal Checkout order was created for invoice ${inv.number} (${money(inv.amount, inv.currency)}).`,
    data: { orderId: order.id, debugId: order.debugId },
  });
  return { orderId: order.id };
}

export async function completeCheckout(invoiceId: string, orderId: string) {
  const db = await getDb();
  const { inv, client } = await payableInvoice(invoiceId);
  const cap = await captureOrder(orderId);
  const matches = cap.status === "COMPLETED" && cap.referenceId === inv.id && cap.captured === inv.amount && cap.currency === inv.currency;
  if (matches) {
    await db.update(schema.invoices).set({ status: "PAID", paidAt: await now() }).where(eq(schema.invoices.id, inv.id));
  }
  await audit({
    actorType: "paypal",
    actorId: "checkout",
    action: matches ? "invoice.paid" : "checkout.capture_mismatch",
    subjectType: "invoice",
    subjectId: inv.id,
    ruleIds: matches ? [] : ["R8"],
    why: matches
      ? `${client.name} paid invoice ${inv.number}: PayPal confirmed a completed capture of ${money(cap.captured, inv.currency)} (capture ${cap.captureId}). Marked paid from PayPal's own record.`
      : `PayPal capture for ${inv.number} didn't match (status ${cap.status}, ${money(cap.captured, cap.currency ?? inv.currency)} of ${money(inv.amount, inv.currency)}). The invoice stays unpaid.`,
    data: { orderId, captureId: cap.captureId, debugId: cap.debugId },
  });
  return { paid: matches, captureId: cap.captureId, status: cap.status };
}
