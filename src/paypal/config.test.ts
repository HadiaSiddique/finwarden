import { describe, expect, it } from "vitest";
import { PAYPAL_SANDBOX_BASE, paypalConfig } from "./config";

const creds = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };

describe("sandbox-only guard", () => {
  it("defaults to the sandbox", () => {
    expect(paypalConfig(creds).baseUrl).toBe(PAYPAL_SANDBOX_BASE);
  });

  it("refuses live PayPal", () => {
    expect(() => paypalConfig({ ...creds, PAYPAL_BASE_URL: "https://api-m.paypal.com" })).toThrow(/refuses to run against live/);
  });

  it("explains missing credentials", () => {
    expect(() => paypalConfig({})).toThrow(/PAYPAL_CLIENT_ID is missing/);
  });
});
