import { hasPayPalCredentials } from "./client";

// Stub only for tests and local development, and never in production.
export function usingStub(): boolean {
  if (process.env.PAYPAL_MODE === "stub") return true;
  return !hasPayPalCredentials() && process.env.NODE_ENV !== "production";
}
