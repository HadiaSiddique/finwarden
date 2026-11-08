import { z } from "zod";
import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { createIntent } from "@/services/intents";

const payout = z.object({
  method: z.enum(["paypal_email", "paypal_phone", "venmo"]),
  receiver: z.string().min(3),
  currency: z.string().length(3).default("USD"),
  country: z.string().length(2).optional(),
});

// Creates a payment and runs the fraud checks. It never sends money and never approves.
export const POST = handler(
  z.object({
    payeeId: z.string().nullable().optional(),
    payeeName: z.string().min(1),
    amountUsd: z.number().positive().max(1_000_000),
    invoiceNumber: z.string().max(64).optional(),
    memo: z.string().max(500).optional(),
    payout: payout.optional(),
  }),
  async (body) => {
    const user = await requireUser();
    return createIntent({ ...body, amount: Math.round(body.amountUsd * 100) }, { type: "user", id: user.id });
  },
);
