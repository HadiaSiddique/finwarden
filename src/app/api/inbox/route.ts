import { z } from "zod";
import { handler } from "@/server/http";
import { getSession, requireUser } from "@/server/session";
import { analyseMessage, recentInbox } from "@/services/inbox";

export const POST = handler(z.object({ text: z.string().trim().min(10).max(6000) }), async ({ text }) => {
  const user = await requireUser();
  const session = await getSession();
  return analyseMessage(text, user.id, session.sid);
});

export const GET = handler(null, async () => {
  await requireUser();
  return { items: await recentInbox() };
});
