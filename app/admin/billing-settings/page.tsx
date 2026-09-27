import { requireSuperAdmin } from "@/lib/admin";
import { getBillingSettings } from "@/lib/saas-billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { BillingSettingsForm } from "@/components/admin/billing-settings-form";

export const metadata = { title: "Billing settings · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminBillingSettingsPage() {
  await requireSuperAdmin();
  const settings = await getBillingSettings();

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Billing settings"
        description="QRIS, nomor konfirmasi, dan aturan siklus tagihan untuk seluruh platform."
      />

      <Card>
        <CardHeader>
          <CardTitle>Pembayaran QRIS</CardTitle>
          <CardDescription>
            Berlaku untuk semua tagihan langganan My Landing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingSettingsForm
            settings={{
              qrisImageUrl: settings.qrisImageUrl,
              qrisMerchantName: settings.qrisMerchantName,
              whatsappNumber: settings.whatsappNumber,
              paymentInstruction: settings.paymentInstruction,
              invoiceWindowHours: settings.invoiceWindowHours,
              graceDays: settings.graceDays,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
