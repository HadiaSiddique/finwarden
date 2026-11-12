"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
      }) => { render: (el: HTMLElement) => Promise<void> };
    };
  }
}

// PayPal JS SDK buttons (PayPal, Pay Later, card where available). The server creates and
// captures the order; this component never decides whether the invoice is paid.
export default function PayButtons({ invoiceId, clientId, currency }: { invoiceId: string; clientId: string; currency: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ kind: "idle" | "paid" | "error"; text?: string }>({ kind: "idle" });

  useEffect(() => {
    if (!clientId) return;
    const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=capture&enable-funding=paylater,venmo`;
    const render = () => {
      if (!window.paypal || !ref.current) return;
      ref.current.innerHTML = "";
      window.paypal
        .Buttons({
          createOrder: async () => (await api<{ orderId: string }>("/api/checkout", { action: "create", invoiceId })).orderId,
          onApprove: async ({ orderID }) => {
            const r = await api<{ paid: boolean; status: string }>("/api/checkout", { action: "capture", invoiceId, orderId: orderID });
            setState(r.paid ? { kind: "paid" } : { kind: "error", text: `PayPal status: ${r.status}. Not marked paid.` });
          },
          onError: (err) => setState({ kind: "error", text: String((err as Error)?.message ?? err) }),
        })
        .render(ref.current);
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      render();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = render;
    document.body.appendChild(s);
  }, [clientId, currency, invoiceId]);

  if (!clientId) return <p className="text-sm text-red">PayPal isn&apos;t configured on this server.</p>;
  if (state.kind === "paid") return <p className="rounded-lg bg-green-soft p-3 text-green">Payment confirmed by PayPal. Thank you!</p>;
  return (
    <div>
      <div ref={ref} />
      {state.kind === "error" && <p className="mt-2 text-sm text-red">{state.text}</p>}
    </div>
  );
}
