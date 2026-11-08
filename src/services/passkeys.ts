// Passkeys (WebAuthn). Approvals sign a challenge derived from the intent hash,
// so a signature can only ever approve that exact amount and recipient.
import { createHash, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { intentHash } from "@/trust/hash";
import { TrustError, audit, newId } from "./core";
import { money } from "@/trust/rules";
import { recordVerifiedApproval } from "./intents";
import { loadIntent } from "./repo";

const CHALLENGE_TTL_MS = 5 * 60_000;

function rp() {
  return {
    rpID: process.env.WEBAUTHN_RP_ID ?? "localhost",
    origin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000",
    rpName: "Finwarden",
  };
}

async function userPasskeys(userId: string) {
  const db = await getDb();
  return db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, userId));
}

export async function hasPasskey(userId: string) {
  return (await userPasskeys(userId)).length > 0;
}

export async function registrationOptions(user: { id: string; email: string; name: string }) {
  const db = await getDb();
  const options = await generateRegistrationOptions({
    rpName: rp().rpName,
    rpID: rp().rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (await userPasskeys(user.id)).map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await db.insert(schema.authChallenges).values({
    id: newId("ch"),
    userId: user.id,
    purpose: "register",
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return options;
}

async function takeChallenge(userId: string, purpose: "register" | "approve", challenge: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.authChallenges)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authChallenges.userId, userId),
        eq(schema.authChallenges.purpose, purpose),
        eq(schema.authChallenges.challenge, challenge),
        isNull(schema.authChallenges.usedAt),
        gt(schema.authChallenges.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) throw new TrustError("This passkey request expired or was already used. Try again.");
  return row;
}

function challengeFrom(response: { response: { clientDataJSON: string } }): string {
  const clientData = JSON.parse(new TextDecoder().decode(isoBase64URL.toBuffer(response.response.clientDataJSON)));
  return clientData.challenge;
}

export async function verifyRegistration(userId: string, response: RegistrationResponseJSON) {
  const db = await getDb();
  const challenge = await takeChallenge(userId, "register", challengeFrom(response));
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    requireUserVerification: true,
  });
  if (!result.verified) throw new TrustError("Passkey could not be verified.");
  const { credential } = result.registrationInfo;
  await db.insert(schema.passkeys).values({
    id: credential.id,
    userId,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
  });
  await audit({ actorType: "user", actorId: userId, action: "passkey.registered", subjectType: "user", subjectId: userId, why: "A passkey was added. Payments can only be approved with it, inside the app." });
}

// The challenge the authenticator signs: sha256(intent hash + random nonce).
export function approvalChallenge(hash: string, nonce: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(hash).update(nonce).digest());
}

export async function approvalOptions(userId: string, intentId: string) {
  const db = await getDb();
  const intent = await loadIntent(intentId);
  if (!intent) throw new TrustError("Payment not found.");
  const keys = await userPasskeys(userId);
  if (!keys.length) throw new TrustError("Add a passkey before approving payments.");
  const hash = intentHash(intent);
  const options = await generateAuthenticationOptions({
    rpID: rp().rpID,
    allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports })),
    userVerification: "required",
    challenge: approvalChallenge(hash, randomBytes(16)),
  });
  await db.insert(schema.authChallenges).values({
    id: newId("ch"),
    userId,
    purpose: "approve",
    challenge: options.challenge,
    intentId,
    intentHash: hash,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return {
    options,
    summary: `Approve ${money(intent.amount, intent.currency)} to ${intent.payeeName} (${intent.payout.receiver})`,
  };
}

export async function verifyApproval(userId: string, response: AuthenticationResponseJSON) {
  const db = await getDb();
  const challenge = await takeChallenge(userId, "approve", challengeFrom(response));
  const [key] = await db
    .select()
    .from(schema.passkeys)
    .where(and(eq(schema.passkeys.id, response.id), eq(schema.passkeys.userId, userId)));
  if (!key) throw new TrustError("That passkey doesn't belong to you.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    credential: { id: key.id, publicKey: isoBase64URL.toBuffer(key.publicKey), counter: key.counter, transports: key.transports as never },
    requireUserVerification: true,
  });
  if (!result.verified) throw new TrustError("Passkey check failed. Nothing was approved.");
  await db.update(schema.passkeys).set({ counter: result.authenticationInfo.newCounter }).where(eq(schema.passkeys.id, key.id));
  await recordVerifiedApproval(challenge.intentId!, userId, challenge.intentHash!);
  return { intentId: challenge.intentId! };
}
