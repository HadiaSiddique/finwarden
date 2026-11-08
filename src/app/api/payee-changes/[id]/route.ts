import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { confirmPayeeChange } from "@/services/payee-changes";

// Records the result of calling the payee back on the contact already on file.
export const POST = handler(z.object({ confirmed: z.boolean() }), async ({ confirmed }, _req, { id }) => {
  const user = await requireUser();
  await confirmPayeeChange(id, user.id, confirmed);
});
