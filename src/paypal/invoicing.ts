// PayPal Invoicing v2: create, send, remind, get.
// API reference: https://developer.paypal.com/docs/api/invoicing/v2/
import { randomUUID } from "node:crypto";
import { minorToValue, paypalFetch } from "./client";
import { usingStub } from "./mode";

export interface InvoiceInput {
  number: string;
  description: string;
  amount: number; // cents
  currency: string;
  dueDate: Date;
  recipientName: string;
  recipientEmail: string;
  note?: string;
}

export interface PayPalInvoice {
  id: string;
  status: string;
  payerViewUrl: string | null;
  paidAmount: number | null;
  stub: boolean;
}

interface RawInvoice {
  id: string;
  status: string;
  detail?: { metadata?: { recipient_view_url?: string } };
  payments?: { paid_amount?: { value: string } };
}

function toInvoice(r: RawInvoice): PayPalInvoice {
  return {
    id: r.id,
    status: r.status,
    payerViewUrl: r.detail?.metadata?.recipient_view_url ?? null,
    paidAmount: r.payments?.paid_amount ? Math.round(Number(r.payments.paid_amount.value) * 100) : null,
    stub: false,
  };
}

const stubInvoices = new Map<string, PayPalInvoice>();

export async function createAndSendInvoice(input: InvoiceInput): Promise<PayPalInvoice> {
  if (usingStub()) {
    const inv = { id: "STUB-INV-" + randomUUID().slice(0, 8).toUpperCase(), status: "SENT", payerViewUrl: null, paidAmount: null, stub: true };
    stubInvoices.set(inv.id, inv);
    return inv;
  }
  const [given, ...rest] = input.recipientName.split(" ");
  const created = await paypalFetch<RawInvoice>("/v2/invoicing/invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      detail: {
        invoice_number: `${input.number}-${Date.now().toString(36).toUpperCase()}`,
        currency_code: input.currency,
        note: input.note ?? "Thank you for your business.",
        payment_term: { due_date: input.dueDate.toISOString().slice(0, 10) },
      },
      invoicer: { business_name: "Sara's Studio" },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: given, surname: rest.join(" ") || given },
            email_address: input.recipientEmail,
          },
        },
      ],
      items: [{ name: input.description.slice(0, 200), quantity: "1", unit_amount: { currency_code: input.currency, value: minorToValue(input.amount) } }],
    },
  });
  await paypalFetch(`/v2/invoicing/invoices/${created.data.id}/send`, {
    method: "POST",
    body: { send_to_invoicer: false, send_to_recipient: true },
  });
  return getInvoice(created.data.id);
}

export async function remindInvoice(id: string, subject: string, note: string): Promise<void> {
  if (usingStub()) return;
  await paypalFetch(`/v2/invoicing/invoices/${id}/remind`, {
    method: "POST",
    body: { subject: subject.slice(0, 100), note: note.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true },
  });
}

export async function getInvoice(id: string): Promise<PayPalInvoice> {
  if (usingStub()) return stubInvoices.get(id) ?? { id, status: "SENT", payerViewUrl: null, paidAmount: null, stub: true };
  const r = await paypalFetch<RawInvoice>(`/v2/invoicing/invoices/${id}`);
  return toInvoice(r.data);
}
