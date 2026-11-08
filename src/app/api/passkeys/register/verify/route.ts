import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { verifyRegistration } from "@/services/passkeys";

export const POST = handler(z.object({ response: z.custom<RegistrationResponseJSON>((v) => typeof v === "object" && v !== null) }), async ({ response }) => {
  const user = await requireUser();
  await verifyRegistration(user.id, response);
});
