// Checks whether PayPal Orders v2 (Checkout) works with the current sandbox app.
// Usage: npx tsx --env-file=.env.local scripts/orders-smoke.mts
import { paypalFetch } from "../src/paypal/client";

try {
  const r = await paypalFetch<{ id: string; status: string }>("/v2/checkout/orders", {
    method: "POST",
    body: { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "10.00" }, description: "Finwarden sandbox check" }] },
  });
  console.log("Orders OK:", r.data.id, r.data.status);
} catch (e) {
  const err = e as { status?: number; body?: unknown; message: string };
  console.log("Orders FAILED:", err.status, err.message, JSON.stringify(err.body)?.slice(0, 300));
}
