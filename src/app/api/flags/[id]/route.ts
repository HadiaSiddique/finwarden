import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { acknowledgeFlag, resolveFlag } from "@/services/intents";

// Amber flags are acknowledged; red flags are resolved by the owner with a written reason.
export const POST = handler(
  z.discriminatedUnion("action", [z.object({ action: z.literal("acknowledge") }), z.object({ action: z.literal("resolve"), reason: z.string() })]),
  async (body, _req, { id }) => {
    const user = await requireUser();
    if (body.action === "acknowledge") await acknowledgeFlag(id, user.id);
    else await resolveFlag(id, user.id, body.reason);
  },
);
