"use client";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[] = [],
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.reasons ?? []);
  return data as T;
}

export async function registerPasskey() {
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/passkeys/register/options", {});
  const response = await startRegistration({ optionsJSON });
  await api("/api/passkeys/register/verify", { response });
}

// The browser asks for a fingerprint, face or PIN. The signature is bound to this exact payment.
export async function approveWithPasskey(intentId: string) {
  const { options } = await api<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; summary: string }>("/api/approvals/options", { intentId });
  const response = await startAuthentication({ optionsJSON: options });
  await api("/api/approvals/verify", { response });
}

export function money(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export function shortDate(d: string | Date | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
