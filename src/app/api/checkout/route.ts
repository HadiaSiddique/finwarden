import { z } from "zod";
import { handler } from "@/server/http";
import { completeCheckout, startCheckout } from "@/services/checkout";

// Public: the client paying the invoice isn't a Finwarden user. Amounts always come from the
// stored invoice, never from the request.
export const POST = handler(
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), invoiceId: z.string().max(64) }),
    z.object({ action: z.literal("capture"), invoiceId: z.string().max(64), orderId: z.string().max(64) }),
  ]),
  async (body) => (body.action === "create" ? startCheckout(body.invoiceId) : completeCheckout(body.invoiceId, body.orderId)),
);
