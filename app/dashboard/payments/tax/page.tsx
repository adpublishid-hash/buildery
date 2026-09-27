import Link from "next/link";
import { ArrowLeft, ReceiptText } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatTaxRate, taxReportByMonth } from "@/lib/tax-report";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata = { title: "Laporan pajak · My Landing" };
export const dynamic = "force-dynamic";

/** How many months back the table covers. */
const MONTHS = 12;

export default async function TaxReportPage() {
  const { workspace } = await requireCurrentWorkspace();

  const since = new Date();
  since.setMonth(since.getMonth() - (MONTHS - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [setting, rows] = await Promise.all([
    prisma.ecommerceSetting.findUnique({
      where: { workspaceId: workspace.id },
      select: { taxEnabled: true, taxRateBps: true, taxLabel: true },
    }),
    taxReportByMonth({ workspaceId: workspace.id, since }),
  ]);

  const taxEnabled = Boolean(setting?.taxEnabled);
  const taxLabel = setting?.taxLabel?.trim() || "PPN";
  const rateBps = Math.min(10_000, Math.max(0, setting?.taxRateBps ?? 0));

  const totalTax = rows.reduce((sum, row) => sum + row.tax, 0);
  const totalRefunded = rows.reduce((sum, row) => sum + row.refunded, 0);
  const netTax = Math.max(totalTax - totalRefunded, 0);

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke pembayaran
      </Link>

      <PageHeader
        title="Laporan pajak"
        description={`Pajak yang benar-benar terkumpul dari order lunas, ${MONTHS} bulan terakhir.`}
      />

      {!taxEnabled ? (
        <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-800">
          Pajak sedang nonaktif. Angka di bawah berasal dari order lama yang sempat dikenai
          pajak.{" "}
          <Link href="/dashboard/settings" className="font-medium underline">
            Atur pajak
          </Link>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`${taxLabel} terkumpul`} value={formatPrice(totalTax)} icon={ReceiptText} />
        <StatCard
          label="Dikembalikan lewat refund"
          value={formatPrice(totalRefunded)}
          delta="Proporsional terhadap nilai refund"
        />
        <StatCard
          label="Bersih"
          value={formatPrice(netTax)}
          delta={taxEnabled ? `Tarif ${formatTaxRate(rateBps)}%` : undefined}
          trend="up"
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Per bulan</CardTitle>
          <CardDescription>
            Dasar pengenaan adalah subtotal setelah diskon, tanpa pajak yang sudah termasuk di
            harga. Ongkir tidak dikenai pajak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
              Belum ada order lunas dalam periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                    <th className="py-2 font-medium">Bulan</th>
                    <th className="py-2 text-right font-medium">Order</th>
                    <th className="py-2 text-right font-medium">Dasar pajak</th>
                    <th className="py-2 text-right font-medium">{taxLabel}</th>
                    <th className="py-2 text-right font-medium">Refund</th>
                    <th className="py-2 text-right font-medium">Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-zinc-100">
                      <td className="py-2.5">{monthLabel(row.key)}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.orders}</td>
                      <td className="py-2.5 text-right tabular-nums text-zinc-500">
                        {formatPrice(row.taxable)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatPrice(row.tax)}</td>
                      <td className="py-2.5 text-right tabular-nums text-zinc-800">
                        {row.refunded > 0 ? `− ${formatPrice(row.refunded)}` : "—"}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums">
                        {formatPrice(Math.max(row.tax - row.refunded, 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}
