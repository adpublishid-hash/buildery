import Link from "next/link";
import {
  BellRing,
  Check,
  CreditCard,
  LifeBuoy,
  Palette,
  Settings,
  Users,
  X,
} from "lucide-react";

import type { MemberRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { CUSTOM_DOMAIN_TARGET_IP } from "@/lib/domain";
import { PUBLIC_SITE_DOMAIN } from "@/lib/public-url";
import { getOrCreateEcommerceSetting } from "@/lib/ecommerce-settings";
import {
  assignableMemberRoles,
  canInWorkspace,
  canManageMember,
  MEMBER_ROLE_LABEL,
} from "@/lib/permissions";
import { getLimitSummaries, getUserPlan } from "@/lib/saas-limits";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { resolveSettingsTab } from "@/lib/settings-tabs";
import { cn, formatDate, formatPrice, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { SubscriptionControls } from "@/components/billing/subscription-controls";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EcommerceSettingsForm } from "@/components/ecommerce/ecommerce-settings-form";
import { BrandingForm } from "@/components/workspaces/branding-form";
import { DeleteWorkspaceDialog } from "@/components/workspaces/delete-workspace-dialog";
import { GeneralSettingsForm } from "@/components/workspaces/general-settings-form";
import { InvitationRowActions } from "@/components/workspaces/invitation-row-actions";
import { InviteMemberDialog } from "@/components/workspaces/invite-member-dialog";
import { MemberRowActions } from "@/components/workspaces/member-row-actions";
import { WorkspaceGovernance } from "@/components/workspaces/workspace-governance";
import { SalesNotificationForm } from "@/components/workspaces/sales-notification-form";
import { withoutEcommerceSecrets } from "@/lib/secret-fields";

export const metadata = { title: "Pengaturan · My Landing" };

const settingsCardClass =
  "rounded-2xl border-zinc-200 shadow-sm dark:border-zinc-800";

/**
 * One tab at a time — and only that tab's queries.
 *
 * This page used to render every section in one column and fetch all nine
 * datasets on every visit, even to change a workspace name. Now `?tab=` picks
 * the section, so opening "Umum" runs no extra query at all.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const { workspace, role, user } = await requireCurrentWorkspace();
  const canDelete = canInWorkspace(role, "workspace.delete");
  const tab = resolveSettingsTab(searchParams?.tab, { canDelete });

  return (
    <div className="min-w-0">
      {tab === "umum" && (
        <SettingsSection
          icon={Settings}
          title="Umum"
          description="Identitas dasar workspace, slug publik, dan bahasa default."
        >
          <GeneralSettingsForm
            workspaceId={workspace.id}
            defaultValues={{
              name: workspace.name,
              slug: workspace.slug,
              language: workspace.language,
              locale: workspace.locale as "id-ID" | "en-US" | "en-GB",
              timezone: workspace.timezone as "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura" | "UTC",
              currencyCode: workspace.currencyCode,
              dateFormat: workspace.dateFormat as "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD",
            }}
            canEdit={canInWorkspace(role, "workspace.edit")}
          />
        </SettingsSection>
      )}

      {tab === "tampilan" && (
        <SettingsSection
          icon={Palette}
          title="Tampilan"
          description="Logo, favicon, warna utama, dan domain kustom untuk site publik."
        >
          <BrandingForm
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            defaultValues={{
              logoUrl: workspace.logoUrl ?? "",
              faviconUrl: workspace.faviconUrl ?? "",
              primaryColor: workspace.primaryColor ?? "#18181b",
              customDomain: workspace.customDomain ?? "",
            }}
            canEdit={canInWorkspace(role, "branding.edit")}
            serverIp={CUSTOM_DOMAIN_TARGET_IP}
            platformDomain={PUBLIC_SITE_DOMAIN}
            domainState={{
              verificationToken: workspace.customDomainVerificationToken,
              status: workspace.customDomainStatus,
              sslStatus: workspace.customDomainSslStatus,
            }}
          />
        </SettingsSection>
      )}

      {tab === "anggota" && (
        <MembersTab workspaceId={workspace.id} role={role} currentUserId={user.id} />
      )}

      {tab === "ecommerce" && (
        <EcommerceTab
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          canEdit={canInWorkspace(role, "content.edit")}
        />
      )}

      {tab === "sales-notif" && (
        <SalesNotificationTab
          workspaceId={workspace.id}
          canEdit={canInWorkspace(role, "content.edit")}
        />
      )}

      {tab === "billing" && <BillingTab ownerId={workspace.createdById} />}

      {tab === "bantuan" && (
        <SettingsSection
          icon={LifeBuoy}
          title="Bantuan"
          description="Jalur cepat untuk cek status setup dan membuka halaman bantuan."
          contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          <SupportLink
            href="/dashboard/account"
            title="Akun saya"
            description="Ganti nama dan password akunmu sendiri."
          />
          <SupportLink
            href="/dashboard/settings/integrations"
            title="Uji integrasi"
            description="Tes koneksi Midtrans, email, Telegram, dan WhatsApp."
          />
          <SupportLink
            href="/dashboard/system"
            title="Status sistem"
            description="Kesehatan job terjadwal dan pekerjaan yang tertunda."
          />
          <SupportLink
            href="/dashboard/payments"
            title="Payments"
            description="Cek Midtrans, checkout, dan transaksi."
          />
          <SupportLink
            href="/dashboard/support"
            title="Support center"
            description="Panduan setup dan checklist operasional."
          />
          <SupportLink
            href="/dashboard/pages"
            title="Pages"
            description="Atur homepage, publish page, dan buka builder."
          />
        </SettingsSection>
      )}

      {tab === "zona-bahaya" && canDelete && (
        <Card className="rounded-2xl border-zinc-300 shadow-sm dark:border-zinc-700/60">
          <CardHeader>
            <CardTitle className="text-zinc-800">Zona bahaya</CardTitle>
            <CardDescription>
              Workspace dinonaktifkan sekarang dan dapat dipulihkan selama 30 hari sebelum dihapus permanen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteWorkspaceDialog
              workspaceId={workspace.id}
              workspaceName={workspace.name}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function MembersTab({
  workspaceId,
  role,
  currentUserId,
}: {
  workspaceId: string;
  role: MemberRole;
  currentUserId: string;
}) {
  const canManageMembers = canInWorkspace(role, "members.manage");
  const canInvite = canInWorkspace(role, "members.invite");
  const assignable = assignableMemberRoles(role).filter(
    (r) => r !== "OWNER"
  ) as Array<"ADMIN" | "EDITOR" | "VIEWER">;

  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const now = new Date();

  return (
    <Card className={settingsCardClass}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <SectionIcon icon={Users} />
          <div>
            <CardTitle>Anggota</CardTitle>
            <CardDescription>
              Kelola anggota aktif, role, dan undangan yang masih pending.
            </CardDescription>
          </div>
        </div>
        {canInvite && assignable.length > 0 && (
          <InviteMemberDialog
            workspaceId={workspaceId}
            assignableRoles={assignable}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Belum ada anggota"
            description="Undang tim untuk berkolaborasi di workspace ini."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200/70 dark:border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anggota</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Bergabung</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.user.id === currentUserId;
                  const showActions =
                    canManageMembers && !isSelf && canManageMember(role, member.role);
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            {member.user.image ? (
                              <AvatarImage src={member.user.image} alt="" />
                            ) : null}
                            <AvatarFallback>
                              {getInitials(member.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                              {member.user.name ?? member.user.email}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-zinc-400">
                                  (Anda)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {member.user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            member.role === "OWNER" ? "default" : "secondary"
                          }
                        >
                          {MEMBER_ROLE_LABEL[member.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(member.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {showActions ? (
                          <MemberRowActions
                            workspaceId={workspaceId}
                            memberId={member.id}
                            memberName={member.user.name ?? member.user.email}
                            currentRole={member.role}
                            assignableRoles={assignable}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {invitations.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-zinc-200/70 dark:border-zinc-800">
            <div className="border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Undangan pending
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Penerima harus membuka tautan dan menyetujui undangan. Tautan
                hanya dapat digunakan satu kali.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const expired = invitation.expiresAt <= now;
                  return (
                    <TableRow key={invitation.id}>
                      <TableCell className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {invitation.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {MEMBER_ROLE_LABEL[invitation.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={expired ? "secondary" : "default"}>
                          {expired ? "Perlu dikirim ulang" : "Terkirim"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(invitation.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageMembers && (
                          <InvitationRowActions
                            workspaceId={workspaceId}
                            invitationId={invitation.id}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <WorkspaceGovernance
          workspaceId={workspaceId}
          role={role}
          candidates={members
            .filter((member) => member.user.id !== currentUserId)
            .map((member) => ({ id: member.id, label: member.user.name ?? member.user.email }))}
        />
      </CardContent>
    </Card>
  );
}

async function EcommerceTab({
  workspaceId,
  workspaceName,
  canEdit,
}: {
  workspaceId: string;
  workspaceName: string;
  canEdit: boolean;
}) {
  const [ecommerceSetting, manualMethods, pickupLocations] = await Promise.all([
    getOrCreateEcommerceSetting(workspaceId),
    prisma.manualPaymentMethod.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pickupLocation.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  // Payment and shipping credentials stay on the server; the form only learns
  // whether each one exists.
  const { publicSetting, hints } = withoutEcommerceSecrets(ecommerceSetting);

  // The form carries its own title and section menu; wrapping it in a
  // SettingsSection card stacked three frames inside each other.
  return (
    <EcommerceSettingsForm
      setting={publicSetting}
      secretHints={hints}
      manualMethods={manualMethods}
      pickupLocations={pickupLocations}
      workspaceName={workspaceName}
      canEdit={canEdit}
      embedded
    />
  );
}

async function SalesNotificationTab({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  const storefrontSetting = await prisma.storefrontSetting.findUnique({
    where: { workspaceId },
    select: { salesNotificationEnabled: true, salesNotificationText: true },
  });

  return (
    <SettingsSection
      icon={BellRing}
      title="Notifikasi penjualan"
      description="Popup bukti sosial berisi pembelian terbaru di halaman publik."
    >
      <SalesNotificationForm
        enabled={storefrontSetting?.salesNotificationEnabled ?? false}
        text={storefrontSetting?.salesNotificationText ?? null}
        canEdit={canEdit}
      />
    </SettingsSection>
  );
}

async function BillingTab({ ownerId }: { ownerId: string }) {
  const [plan, subscription, limits] = await Promise.all([
    getUserPlan(ownerId),
    prisma.saaSSubscription.findUnique({ where: { userId: ownerId } }),
    getLimitSummaries(ownerId),
  ]);
  const isPaidPlan = plan.monthlyPrice > 0;
  const subscriptionStatus = subscription?.status ?? "ACTIVE";
  const periodEndLabel = subscription?.currentPeriodEnd
    ? subscription.currentPeriodEnd.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <SettingsSection
      icon={CreditCard}
      title="Billing"
      description="Plan aktif, fitur yang terbuka, dan pemakaian limit akun pemilik workspace."
      contentClassName="space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/70 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-zinc-950 dark:text-zinc-50">
              {plan.name}
            </p>
            <Badge variant={isPaidPlan ? "default" : "secondary"}>
              {isPaidPlan ? `${formatPrice(plan.monthlyPrice)}/bulan` : "Gratis"}
            </Badge>
            {subscription ? (
              <Badge
                variant={subscriptionStatus === "ACTIVE" ? "success" : "outline"}
              >
                {subscriptionStatus.charAt(0) +
                  subscriptionStatus.slice(1).toLowerCase()}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {plan.description ?? "Plan My Landing saat ini."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/pricing">
              {isPaidPlan ? "Ganti plan" : "Pilih plan"}
            </Link>
          </Button>
          {subscription && isPaidPlan ? (
            <SubscriptionControls
              cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
              periodEndLabel={periodEndLabel}
            />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FeatureRow label="Affiliate program" enabled={plan.hasAffiliate} />
        <FeatureRow label="Membership tiers" enabled={plan.hasMembership} />
        <FeatureRow
          label="Advanced analytics"
          enabled={plan.hasAdvancedAnalytics}
        />
      </div>

      <div className="space-y-3">
        {limits.map((limit) => {
          const pct =
            limit.limit == null
              ? 0
              : Math.min(
                  100,
                  Math.round((limit.used / Math.max(limit.limit, 1)) * 100)
                );
          const over = limit.limit != null && limit.used >= limit.limit;
          return (
            <div key={limit.kind} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize text-zinc-700 dark:text-zinc-300">
                  {limit.label}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    over ? "font-semibold text-zinc-900" : "text-zinc-500"
                  )}
                >
                  {limit.used} / {limit.limit == null ? "Unlimited" : limit.limit}
                </span>
              </div>
              {limit.limit != null ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={cn(
                      "h-full",
                      over
                        ? "bg-[repeating-linear-gradient(45deg,#18181b_0_5px,#a1a1aa_5px_10px)] dark:bg-[repeating-linear-gradient(45deg,#fafafa_0_5px,#71717a_5px_10px)]"
                        : "bg-zinc-900 dark:bg-zinc-50"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  contentClassName,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={settingsCardClass}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <SectionIcon icon={icon} />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

function SectionIcon({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200/70 px-3 py-2 text-sm dark:border-zinc-800">
      {enabled ? (
        <Check className="h-4 w-4 text-zinc-800" />
      ) : (
        <X className="h-4 w-4 text-zinc-300 dark:text-zinc-700" />
      )}
      <span className={enabled ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400"}>
        {label}
      </span>
    </div>
  );
}

function SupportLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200/70 p-4 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
    >
      <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </Link>
  );
}
