import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export interface SessionData {
  userId?: string;
  sid?: string;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ characters).");
  return "finwarden-local-development-secret-not-for-production";
}

const options = (): SessionOptions => ({
  password: secret(),
  cookieName: "fw_session",
  cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true },
});

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function currentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));
  return user ?? null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in first.");
  return user;
}
