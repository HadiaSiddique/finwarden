import { z } from "zod";

// Finwarden only ever talks to the PayPal sandbox. A live URL is a startup error.
export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string({ error: "PAYPAL_CLIENT_ID is missing" }).min(1, "PAYPAL_CLIENT_ID is missing"),
  PAYPAL_CLIENT_SECRET: z.string({ error: "PAYPAL_CLIENT_SECRET is missing" }).min(1, "PAYPAL_CLIENT_SECRET is missing"),
  PAYPAL_BASE_URL: z
    .string()
    .default(PAYPAL_SANDBOX_BASE)
    .refine((u) => u.replace(/\/+$/, "") === PAYPAL_SANDBOX_BASE, {
      message: `PAYPAL_BASE_URL must be ${PAYPAL_SANDBOX_BASE}. Finwarden refuses to run against live PayPal.`,
    }),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
});

export type PayPalConfig = { clientId: string; clientSecret: string; baseUrl: string; webhookId?: string };

export function paypalConfig(env: Record<string, string | undefined> = process.env): PayPalConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error("PayPal config invalid: " + parsed.error.issues.map((i) => i.message).join("; "));
  }
  return {
    clientId: parsed.data.PAYPAL_CLIENT_ID,
    clientSecret: parsed.data.PAYPAL_CLIENT_SECRET,
    baseUrl: PAYPAL_SANDBOX_BASE,
    webhookId: parsed.data.PAYPAL_WEBHOOK_ID,
  };
}
