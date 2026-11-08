import { handler } from "@/server/http";
import { currentUser } from "@/server/session";
import { usingStub } from "@/paypal/mode";
import { demoMode } from "@/services/core";
import { ensureSeeded } from "@/services/dashboard";
import { hasPasskey } from "@/services/passkeys";

export const GET = handler(null, async () => {
  await ensureSeeded();
  const user = await currentUser();
  return {
    user,
    hasPasskey: user ? await hasPasskey(user.id) : false,
    demoMode: demoMode(),
    paypalStub: usingStub(),
  };
});
