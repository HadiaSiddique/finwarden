import { connection } from "next/server";
import { Suspense } from "react";
import PayButtons from "@/components/PayButtons";
import { invoiceForPayment } from "@/services/checkout";

type Params = Promise<{ id: string }>;

export default function PayPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="text-muted">Loading invoice…</p>}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}

async function Invoice({ params }: { params: Params }) {
  await connection();
  const { id } = await params;
  const inv = await invoiceForPayment(id);
  if (!inv) return <p className="text-muted">Invoice not found.</p>;
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(inv.amount / 100);
  return (
    <div className="card w-full max-w-md p-7">
      <p className="text-sm text-muted">Invoice {inv.number} from Sara&apos;s Studio</p>
      <h1 className="mt-1 text-3xl font-semibold tabular-nums">{amount}</h1>
      <p className="mt-1 text-muted">
        {inv.description} · for {inv.client}
      </p>
      <div className="mt-6">
        {inv.status === "PAID" ? (
          <p className="rounded-lg bg-green-soft p-3 text-green">Paid. Thank you!</p>
        ) : (
          <PayButtons invoiceId={id} clientId={process.env.PAYPAL_CLIENT_ID ?? ""} currency={inv.currency} />
        )}
      </div>
      <p className="mt-6 text-xs text-muted">PayPal sandbox: no real money moves. Pay with a sandbox personal account.</p>
    </div>
  );
}
