import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { handler } from "@/server/http";
import { HttpError, getSession } from "@/server/session";
import { audit, demoMode, newId } from "@/services/core";
import { ensureSeeded } from "@/services/dashboard";

// Demo sign-in for judges. Approvals still need the user's own passkey.
export const POST = handler(z.object({ userId: z.enum(["sara", "omar"]), password: z.string() }), async ({ userId, password }) => {
  if (!demoMode()) throw new HttpError(403, "Demo sign-in is off.");
  if (password !== (process.env.DEMO_PASSWORD ?? "finwarden-demo")) throw new HttpError(401, "Wrong demo password.");
  await ensureSeeded();
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new HttpError(404, "Demo user missing. Reset the demo.");
  const session = await getSession();
  session.userId = user.id;
  session.sid = newId("s");
  await session.save();
  await audit({ actorType: "user", actorId: user.id, action: "auth.demo_sign_in", subjectType: "user", subjectId: user.id, why: `${user.name} signed in to the demo.` });
  return { user };
});
