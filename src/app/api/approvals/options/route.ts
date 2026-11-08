import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { approvalOptions } from "@/services/passkeys";

export const POST = handler(z.object({ intentId: z.string() }), async ({ intentId }) => {
  const user = await requireUser();
  return approvalOptions(user.id, intentId);
});
