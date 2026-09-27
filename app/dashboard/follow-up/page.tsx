import { CheckCircle2, Clock3, Mail, ShoppingBag } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { FollowUpWorkspace } from "@/components/follow-up/follow-up-workspace";

export const metadata = { title: "Follow Up · My Landing" };

export default async function FollowUpPage() {
  const { workspace } = await requireCurrentWorkspace();

  const [pendingOrders, customers, tasks, doneCount] = await Promise.all([
    prisma.order.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.customer.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, email: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.followUpTask.findMany({
      where: { workspaceId: workspace.id, status: { not: "DONE" } },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        order: {
          select: { id: true, orderNumber: true, total: true, status: true },
        },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.followUpTask.count({
      where: { workspaceId: workspace.id, status: "DONE" },
    }),
  ]);

  const pendingValue = pendingOrders.reduce((sum, order) => sum + order.total, 0);
  const overdue = tasks.filter(
    (task) => task.dueAt && task.dueAt.getTime() < Date.now()
  ).length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Follow Up"
        description="Prioritize customers, payment reminders, and open order conversations."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Open follow-ups"
          value={tasks.length}
          delta={`${overdue.toLocaleString("id-ID")} overdue`}
          icon={Mail}
          trend={overdue > 0 ? "down" : "neutral"}
        />
        <StatCard
          label="Pipeline value"
          value={formatPrice(pendingValue)}
          delta="Revenue awaiting completion"
          icon={ShoppingBag}
          trend="up"
        />
        <StatCard
          label="Orders to nudge"
          value={pendingOrders.length}
          delta="Pending or processing"
          icon={Clock3}
        />
        <StatCard
          label="Completed"
          value={doneCount}
          delta="Follow-ups finished"
          icon={CheckCircle2}
          trend="up"
        />
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <FollowUpWorkspace
          tasks={tasks}
          orders={pendingOrders}
          customers={customers}
        />
      </section>
    </div>
  );
}
