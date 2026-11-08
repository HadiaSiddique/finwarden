import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { registrationOptions } from "@/services/passkeys";

export const POST = handler(null, async () => registrationOptions(await requireUser()));
