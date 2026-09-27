import Link from "next/link";
import type { ScheduledJobKind } from "@prisma/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Timer,
} from "lucide-react";

import { getJobHealth, isUnhealthy, type JobHealthRow } from "@/lib/jobs/health";
import {
  SCHEDULED_JOB_DESCRIPTION,
  SCHEDULED_JOB_LABEL,
} from "@/lib/labels";
import { requireWorkspacePermission } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata = { title: "Job Runner · My Landing" };
export const dynamic = "force-dynamic";

/**
 * Is the background worker alive?
 *
 * Everything on this page is derived from the ScheduledJob table, so it
 * answers the question without shell access to the server. The runner's
 * bearer token is deliberately never rendered — only whether one is set.
 */

const STATE_LABEL: Record<JobHealthRow["state"], string> = {
  STALE: "Stale",
  OVERDUE: "Terlambat",
  FAILED: "Gagal",
  NEVER_RUN: "Belum pernah jalan",
  RUNNING: "Berjalan",
  SCHEDULED: "Terjadwal",
  OK: "Sehat",
};

const STATE_VARIANT: Record<
  JobHealthRow["state"],
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  STALE: "destructive",
  OVERDUE: "destructive",
  FAILED: "destructive",
  NEVER_RUN: "outline",
  RUNNING: "default",
  SCHEDULED: "secondary",
  OK: "success",
};

export default async function JobRunnerHealthPage() {
  // Ops surface: owners and admins only.
  await requireWorkspacePermission("workspace.edit");

  const health = await getJobHealth();
  // A boolean, never the value — the secret itself must not reach the client.
  const runnerConfigured = Boolean(process.env.JOBS_RUNNER_SECRET);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Job Runner"
        description="Kesehatan background job yang menopang Meta CAPI, payment expiry, reconciliation, follow-up, dan notifikasi."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/payments/audit">
              <ExternalLink className="h-4 w-4" />
              Payment audit
            </Link>
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Job bermasalah"
          value={health.unhealthy.toLocaleString("id-ID")}
          delta={`dari ${health.rows.length} recurring job`}
          icon={health.unhealthy > 0 ? AlertTriangle : CheckCircle2}
          trend={health.unhealthy > 0 ? "down" : "up"}
        />
        <StatCard
          label="Aktivitas terakhir"
          value={relativeAge(health.lastActivityAt)}
          delta={formatJobDate(health.lastActivityAt)}
          icon={Activity}
          trend={health.lastActivityAt ? "neutral" : "down"}
        />
        <StatCard
          label="Runner secret"
          value={runnerConfigured ? "Terpasang" : "Kosong"}
          delta={
            runnerConfigured
              ? "JOBS_RUNNER_SECRET terisi"
              : "POST /api/jobs/run akan menolak"
          }
          icon={Timer}
          trend={runnerConfigured ? "up" : "down"}
        />
        <StatCard
          label="Antrean aktif"
          value={health.rows
            .filter((row) => row.status !== null)
            .length.toLocaleString("id-ID")}
          delta="Pending atau running"
          icon={Activity}
          trend="neutral"
        />
      </section>

      {!health.configured && (
        <p className="mt-6 rounded-xl border border-zinc-300 bg-zinc-100 p-4 text-sm text-zinc-900">
          Belum ada job yang pernah masuk antrean. Pastikan cron atau PM2
          memanggil <code>POST /api/jobs/run</code> — runner akan mendaftarkan
          semua sweep sendiri pada tick pertama.
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recurring jobs</CardTitle>
          <CardDescription>
            Satu baris per sweep. Runner mengantrekan ulang setiap sweep
            otomatis, jadi baris terlambat atau stale berarti worker-nya yang
            tidak jalan.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Jadwal berikut</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai terakhir</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead className="pr-4">Error terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {health.rows.map((row) => (
                  <TableRow
                    key={row.kind}
                    className={isUnhealthy(row.state) ? "bg-zinc-100/50" : undefined}
                  >
                    <TableCell className="pl-4">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {SCHEDULED_JOB_LABEL[row.kind as ScheduledJobKind]}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {SCHEDULED_JOB_DESCRIPTION[row.kind as ScheduledJobKind]}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[row.state]}>
                        {STATE_LABEL[row.state]}
                      </Badge>
                      {row.state === "OVERDUE" && (
                        <p className="mt-1 text-xs text-zinc-800">
                          telat {row.overdueMinutes} menit
                        </p>
                      )}
                      {row.state === "STALE" && (
                        <p className="mt-1 text-xs text-zinc-800">
                          lock lewat batas reclaim
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatInterval(row.intervalMinutes)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatJobDate(row.runAt)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatJobDate(row.startedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatJobDate(row.lastFinishedAt)}
                      {row.lastFinishedStatus && (
                        <span className="ml-1 text-zinc-400">
                          ({row.lastFinishedStatus.toLowerCase()})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {row.attempts}
                      {row.maxAttempts > 0 ? ` / ${row.maxAttempts}` : ""}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate pr-4 text-xs text-zinc-800">
                      {row.lastError ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Cara memastikan worker jalan</CardTitle>
          <CardDescription>
            Runner tidak punya scheduler sendiri — sesuatu di luar aplikasi
            harus mengetuknya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
          <p>
            PM2 menjalankan proses <code>buildery-jobs</code> yang memanggil{" "}
            <code>POST /api/jobs/run</code> dengan header{" "}
            <code>Authorization: Bearer $JOBS_RUNNER_SECRET</code>. Cek dengan{" "}
            <code>pm2 status buildery-jobs</code> dan{" "}
            <code>pm2 logs buildery-jobs</code>.
          </p>
          <p>
            Kalau kolom “Selesai terakhir” berhenti bergerak, yang mati adalah
            pemanggilnya, bukan job-nya. Halaman ini adalah health check-nya:
            “Job bermasalah” harus 0 dan “Aktivitas terakhir” harus dalam
            hitungan menit.
          </p>
          <p className="text-zinc-500">
            Detail setup ada di <code>DEPLOYMENT.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function formatJobDate(date: Date | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatInterval(minutes: number) {
  if (minutes < 60) return `${minutes} menit`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} jam` : `${minutes} menit`;
}

function relativeAge(date: Date | null) {
  if (!date) return "-";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}
