// PayPal Orders v2 (Checkout): create, capture, get.
// API reference: https://developer.paypal.com/docs/api/orders/v2/
import { minorToValue, paypalFetch } from "./client";

interface RawOrder {
  id: string;
  status: string;
  purchase_units?: {
    reference_id?: string;
    amount?: { value: string; currency_code: string };
    payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] };
  }[];
}

export async function createOrder(referenceId: string, amount: number, currency: string, description: string) {
  const r = await paypalFetch<RawOrder>("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: referenceId, description: description.slice(0, 127), amount: { currency_code: currency, value: minorToValue(amount) } }],
    },
  });
  return { id: r.data.id, status: r.data.status, debugId: r.debugId };
}

export interface Capture {
  orderId: string;
  status: string;
  referenceId: string | null;
  captureId: string | null;
  captured: number; // cents actually captured
  currency: string | null;
  debugId: string | null;
}

function toCapture(o: RawOrder, debugId: string | null): Capture {
  const pu = o.purchase_units?.[0];
  const cap = pu?.payments?.captures?.find((c) => c.status === "COMPLETED");
  return {
    orderId: o.id,
    status: o.status,
    referenceId: pu?.reference_id ?? null,
    captureId: cap?.id ?? null,
    captured: cap ? Math.round(Number(cap.amount.value) * 100) : 0,
    currency: cap?.amount.currency_code ?? null,
    debugId,
  };
}

export async function captureOrder(orderId: string): Promise<Capture> {
  const r = await paypalFetch<RawOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: {} });
  return toCapture(r.data, r.debugId);
}

export async function getOrder(orderId: string): Promise<Capture> {
  const r = await paypalFetch<RawOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  return toCapture(r.data, r.debugId);
}
