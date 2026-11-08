import { handler } from "@/server/http";
import { getSession } from "@/server/session";

export const POST = handler(null, async () => {
  const session = await getSession();
  session.destroy();
});
