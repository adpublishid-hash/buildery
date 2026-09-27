import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { savePlanAdminAction } from "@/lib/actions/admin";
import { requireSuperAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

export default async function AdminPlansPage() {
  await requireSuperAdmin();
  const plans = await prisma.saaSPlan.findMany({ orderBy: { sortOrder: "asc" } });
  const fields = [["workspaceLimit", "Workspace"], ["memberLimit", "Member/workspace"], ["pageLimit", "Page/workspace"], ["productLimit", "Produk/workspace"], ["courseLimit", "Course/workspace"], ["formLimit", "Form/workspace"], ["monthlyOrderLimit", "Order/bulan"], ["orderRetentionMonths", "Retensi order (bulan)"]] as const;
  return <div className="w-full min-w-0"><PageHeader title="Plans" description="Harga dan batas penggunaan yang berlaku pada billing dan seluruh workspace." /><div className="grid gap-4 lg:grid-cols-2">{plans.map((plan) => <Card key={plan.id}><CardHeader><CardTitle className="flex items-center justify-between"><span>{plan.name}</span><span className="text-sm font-normal text-zinc-500">{formatPrice(plan.monthlyPrice)}/bulan</span></CardTitle></CardHeader><CardContent><form action={savePlanAdminAction} className="space-y-4"><input type="hidden" name="id" value={plan.id} /><label className="block text-sm"><span className="mb-1 block text-zinc-600">Harga bulanan</span><Input type="number" min="0" name="monthlyPrice" defaultValue={plan.monthlyPrice} /></label><div className="grid grid-cols-2 gap-3">{fields.map(([name, label]) => <label key={name} className="block text-sm"><span className="mb-1 block text-zinc-600">{label}</span><Input type="number" min="0" name={name} defaultValue={plan[name] ?? ""} placeholder="Tanpa batas" /></label>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublic" defaultChecked={plan.isPublic} /> Tampil di halaman harga</label><Button type="submit">Simpan plan</Button></form></CardContent></Card>)}</div></div>;
}
