import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { executeIntents } from "@/trust/executor";

export const POST = handler(z.object({ intentIds: z.array(z.string()).min(1).max(50) }), async ({ intentIds }) => {
  const user = await requireUser();
  return executeIntents(intentIds, user.id);
});
