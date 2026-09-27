import { CheckCircle2, Clock3, MailPlus, ShoppingCart, Wallet } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { AbandonedWorkspace } from "@/components/abandoned/abandoned-workspace";

export const metadata = { title: "Abandoned · My Landing" };

export default async function AbandonedPage() {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      workspaceId: workspace.id,
      status: "PENDING",
      createdAt: { lte: cutoff },
      payment: {
        is: {
          status: "PENDING",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      OR: [
        { abandonedRecovery: { is: null } },
        {
          abandonedRecovery: {
            is: { status: { in: ["OPEN", "CONTACTED", "SNOOZED"] } },
          },
        },
      ],
      NOT: {
        abandonedRecovery: {
          is: {
            status: "SNOOZED",
            snoozedUntil: { gt: now },
          },
        },
      },
    },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      abandonedRecovery: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const [recoveredCount, contactedCount] = await Promise.all([
    prisma.abandonedCheckoutRecovery.count({
      where: { workspaceId: workspace.id, status: "RECOVERED" },
    }),
    prisma.abandonedCheckoutRecovery.count({
      where: { workspaceId: workspace.id, status: "CONTACTED" },
    }),
  ]);

  const recoveryValue = orders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Abandoned"
        description="Recover pending checkouts that have not moved forward after 30 minutes."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Abandoned orders"
          value={orders.length}
          icon={ShoppingCart}
        />
        <StatCard
          label="Recoverable value"
          value={formatPrice(recoveryValue)}
          delta="Pending checkout total"
          icon={Wallet}
          trend="up"
        />
        <StatCard
          label="Contacted"
          value={contactedCount}
          delta="Auto/manual reminders sent"
          icon={MailPlus}
        />
        <StatCard
          label="Recovered"
          value={recoveredCount}
          delta="Marked as recovered"
          icon={CheckCircle2}
          trend="up"
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-zinc-500" />
            <CardTitle>Recovery queue</CardTitle>
          </div>
          <CardDescription>
            Auto reminders run every 10 minutes. You can still queue a manual follow-up, snooze, or close checkout recovery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AbandonedWorkspace orders={orders} />
        </CardContent>
      </Card>
    </div>
  );
}
