// PayPal REST client: OAuth2 client credentials, cached token, retries on 429 and 5xx.
import { paypalConfig } from "./config";

let cached: { token: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly debugId: string | null,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const cfg = paypalConfig();
  const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PayPalError("PayPal sign-in failed. Check the sandbox client ID and secret.", res.status, res.headers.get("paypal-debug-id"), body);
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

export interface PayPalResponse<T> {
  data: T;
  status: number;
  debugId: string | null;
}

export async function paypalFetch<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<PayPalResponse<T>> {
  const cfg = paypalConfig();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const debugId = res.headers.get("paypal-debug-id");
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (res.status === 401 && attempt === 0) {
      cached = null;
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new PayPalError(data?.message ?? `PayPal returned ${res.status}`, res.status, debugId, data);
    return { data: data as T, status: res.status, debugId };
  }
}

export function hasPayPalCredentials(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function minorToValue(minor: number): string {
  return (minor / 100).toFixed(2);
}
