import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { verifyApproval } from "@/services/passkeys";

export const POST = handler(z.object({ response: z.custom<AuthenticationResponseJSON>((v) => typeof v === "object" && v !== null) }), async ({ response }) => {
  const user = await requireUser();
  return verifyApproval(user.id, response);
});
