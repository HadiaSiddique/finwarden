import { z } from "zod";
import { handler } from "@/server/http";
import { getSession, requireUser } from "@/server/session";
import { draftInvoiceFromText, refreshInvoice, sendInvoice, sendReminder } from "@/services/invoices";

export const POST = handler(
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("draft"), text: z.string().trim().min(5).max(1000) }),
    z.object({ action: z.literal("send"), invoiceId: z.string() }),
    z.object({ action: z.literal("remind"), invoiceId: z.string() }),
    z.object({ action: z.literal("check"), invoiceId: z.string() }),
  ]),
  async (body) => {
    const user = await requireUser();
    const sid = (await getSession()).sid;
    switch (body.action) {
      case "draft":
        return draftInvoiceFromText(body.text, user.id, sid);
      case "send":
        return sendInvoice(body.invoiceId, user.id);
      case "remind":
        return sendReminder(body.invoiceId, user.id, sid);
      case "check":
        return refreshInvoice(body.invoiceId, user.id);
    }
  },
);
