import { z } from "zod";
import { getDb } from "@/db";
import { resetAndSeed } from "@/db/seed";
import { handler } from "@/server/http";
import { HttpError, getSession, requireUser } from "@/server/session";
import { advanceClock, demoMode } from "@/services/core";
import { runScenario, SCENARIOS } from "@/services/scenarios";

export const POST = handler(
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("reset") }),
    z.object({ action: z.literal("clock"), hours: z.number().int().min(1).max(24 * 30) }),
    z.object({ action: z.literal("scenario"), name: z.enum(Object.keys(SCENARIOS) as [string, ...string[]]) }),
  ]),
  async (body) => {
    if (!demoMode()) throw new HttpError(403, "Demo controls are off.");
    const user = await requireUser();
    if (body.action === "reset") {
      await resetAndSeed(await getDb());
      // Passkeys were cleared too, so sign the user out.
      (await getSession()).destroy();
      return { reset: true };
    }
    if (body.action === "clock") return advanceClock(body.hours, user.id);
    return runScenario(body.name, user.id, (await getSession()).sid);
  },
);
