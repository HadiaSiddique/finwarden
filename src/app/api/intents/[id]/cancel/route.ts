import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { cancelIntent } from "@/services/intents";

export const POST = handler(z.object({ reason: z.string().min(1).max(300) }), async ({ reason }, _req, { id }) => {
  const user = await requireUser();
  await cancelIntent(id, user.id, reason);
});
