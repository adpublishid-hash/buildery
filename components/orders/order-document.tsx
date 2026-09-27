import { formatPrice } from "@/lib/utils";
import { PrintButton } from "@/components/orders/print-button";

type DocumentOrder = {
  orderNumber: string;
  invoiceNumber: string | null;
  createdAt: Date;
  status: string;
  subtotal: number;
  discount: number;
  shippingCost: number;
  shippingMethodName: string | null;
  taxAmount: number;
  total: number;
  customerNameSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  shippingRecipientName: string | null;
  shippingRecipientPhone: string | null;
  shippingAddress: string | null;
  shippingCityName: string | null;
  shippingProvinceName: string | null;
  shippingPostalCode: string | null;
  items: { id: string; nameSnapshot: string; skuSnapshot: string | null; unitPrice: number; quantity: number }[];
  customer: { name: string; email: string; phone: string | null } | null;
};

export function OrderDocument({ order, workspaceName, mode = "invoice" }: { order: DocumentOrder; workspaceName: string; mode?: "invoice" | "packing" }) {
  const name = order.customer?.name || order.customerNameSnapshot || "Customer";
  const email = order.customer?.email || order.customerEmailSnapshot;
  const phone = order.customer?.phone || order.customerPhoneSnapshot;
  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-white p-8 text-zinc-950 print:max-w-none print:p-0">
      <div className="mb-8 flex items-start justify-between gap-6 border-b border-zinc-300 pb-6">
        <div><p className="text-sm font-medium text-zinc-500">{workspaceName}</p><h1 className="mt-1 text-3xl font-semibold">{mode === "packing" ? "Packing slip" : "Invoice"}</h1><p className="mt-2 font-mono text-sm">{order.invoiceNumber || order.orderNumber}</p></div>
        <div className="text-right text-sm"><PrintButton /><p className="mt-3">{new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(order.createdAt)}</p><p className="mt-1 uppercase text-zinc-500">{order.status}</p></div>
      </div>
      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <section><h2 className="text-xs font-semibold uppercase text-zinc-500">Customer</h2><p className="mt-2 font-medium">{name}</p>{email ? <p className="text-sm">{email}</p> : null}{phone ? <p className="text-sm">{phone}</p> : null}</section>
        <section><h2 className="text-xs font-semibold uppercase text-zinc-500">Pengiriman</h2><p className="mt-2 font-medium">{order.shippingRecipientName || name}</p>{order.shippingRecipientPhone ? <p className="text-sm">{order.shippingRecipientPhone}</p> : null}{order.shippingAddress ? <p className="mt-1 whitespace-pre-line text-sm">{order.shippingAddress}</p> : <p className="mt-1 text-sm">{order.shippingMethodName || "Tidak memerlukan pengiriman"}</p>}<p className="text-sm">{[order.shippingCityName, order.shippingProvinceName, order.shippingPostalCode].filter(Boolean).join(", ")}</p></section>
      </div>
      <table className="w-full border-collapse text-sm"><thead><tr className="border-y border-zinc-300 text-left"><th className="py-3">Item</th><th className="py-3">SKU</th><th className="py-3 text-right">Qty</th>{mode === "invoice" ? <><th className="py-3 text-right">Harga</th><th className="py-3 text-right">Jumlah</th></> : null}</tr></thead><tbody>{order.items.map((item) => <tr key={item.id} className="border-b border-zinc-200"><td className="py-3 font-medium">{item.nameSnapshot}</td><td className="py-3 text-zinc-500">{item.skuSnapshot || "-"}</td><td className="py-3 text-right">{item.quantity}</td>{mode === "invoice" ? <><td className="py-3 text-right">{formatPrice(item.unitPrice)}</td><td className="py-3 text-right">{formatPrice(item.unitPrice * item.quantity)}</td></> : null}</tr>)}</tbody></table>
      {mode === "invoice" ? <div className="ml-auto mt-6 max-w-sm space-y-2 text-sm"><Row label="Subtotal" value={order.subtotal} /><Row label="Diskon" value={-order.discount} /><Row label={order.shippingMethodName || "Pengiriman"} value={order.shippingCost} />{order.taxAmount > 0 ? <Row label="Pajak" value={order.taxAmount} /> : null}<div className="flex justify-between border-t border-zinc-300 pt-3 text-lg font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div></div> : null}
      <p className="mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-500">Order {order.orderNumber}</p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: number }) { return <div className="flex justify-between"><span className="text-zinc-600">{label}</span><span>{value < 0 ? `- ${formatPrice(Math.abs(value))}` : formatPrice(value)}</span></div>; }
