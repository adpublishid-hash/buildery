"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Check,
  Copy,
  CreditCard,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  PlugZap,
  RefreshCw,
  Target,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteIntegrationConnectionAction,
  rotateIntegrationWebhookAction,
  saveIntegrationConnectionAction,
  setIntegrationEnabledAction,
  setPrimaryIntegrationAction,
  testIntegrationConnectionAction,
} from "@/lib/actions/integration-connections";
import type { ConnectionView } from "@/lib/integrations/connections";
import { getProvider, providersIn, type ProviderDefinition } from "@/lib/integrations/registry";
import { cn } from "@/lib/utils";

/** How a connection in each category changes the store's behaviour. */
const CATEGORY_NOTE: Partial<Record<ProviderDefinition["category"], string>> = {
  EMAIL: "While enabled, store emails go out through the default email provider instead of Mailketing or Gmail. Providers with a list ID also collect new customers and form leads.",
  PAYMENT: "While enabled, checkout sends buyers to the default payment gateway instead of Midtrans. Payments are only marked paid after the status is re-checked with the gateway.",
};

type ChipState = "connected" | "error" | "untested" | "off" | "unavailable";

type Chip =
  | { kind: "provider"; providerId: string }
  | { kind: "builtin"; id: string; label: string; href: string }
  | { kind: "unavailable"; label: string; reason: string };

type Group = { key: string; title: string; icon: LucideIcon; chips: Chip[] };

const WA = (id: string, label: string): Chip => ({
  kind: "builtin",
  id: `whatsapp:${id}`,
  label,
  href: "/dashboard/settings/integrations?section=whatsapp#integrations-form",
});

const GROUPS: Group[] = [
  {
    key: "whatsapp",
    title: "WhatsApp Gateway",
    icon: MessageCircle,
    chips: [WA("WABA", "WhatsApp Cloud API"), WA("WAHA", "WAHA"), WA("WOOWA", "Woowa"), WA("KIRIMI", "Kirimi"), WA("STARSENDER", "Starsender"), WA("ONESENDER", "Onesender")],
  },
  {
    key: "email",
    title: "Email & Newsletter",
    icon: Mail,
    chips: [
      ...providersIn("EMAIL").map((provider) => ({ kind: "provider", providerId: provider.id }) as Chip),
      { kind: "builtin", id: "mailketing", label: "Mailketing", href: "/dashboard/settings/integrations?section=email#integrations-form" },
      { kind: "builtin", id: "gmail", label: "Gmail", href: "/dashboard/settings/integrations?section=email#integrations-form" },
    ],
  },
  {
    key: "payment",
    title: "Payment Gateway",
    icon: CreditCard,
    chips: [
      { kind: "builtin", id: "midtrans", label: "Midtrans", href: "/dashboard/settings?tab=ecommerce" },
      ...providersIn("PAYMENT").map((provider) => ({ kind: "provider", providerId: provider.id }) as Chip),
    ],
  },
  {
    key: "inbox",
    title: "Channel Inbox",
    icon: MessagesSquare,
    chips: providersIn("INBOX").map((provider) => ({ kind: "provider", providerId: provider.id }) as Chip),
  },
  {
    key: "ads",
    title: "Ads & Pixel",
    icon: Target,
    chips: [
      { kind: "builtin", id: "meta", label: "Meta Pixel & CAPI", href: "/dashboard/settings/integrations?section=meta#integrations-form" },
      { kind: "builtin", id: "tiktok", label: "TikTok Ads", href: "/dashboard/settings/integrations?section=tiktok#integrations-form" },
      { kind: "builtin", id: "google", label: "Google", href: "/dashboard/settings/integrations?section=google#integrations-form" },
    ],
  },
  {
    key: "shipping",
    title: "Courier & Shipping",
    icon: Truck,
    chips: [
      { kind: "builtin", id: "rajaongkir", label: "RajaOngkir", href: "/dashboard/settings?tab=ecommerce" },
      ...providersIn("SHIPPING").map((provider) => ({ kind: "provider", providerId: provider.id }) as Chip),
      { kind: "unavailable", label: "Mengantar", reason: "Mengantar has no public API. Share their partner API docs and it can be added." },
    ],
  },
];

const DOT: Record<ChipState, string> = {
  connected: "bg-emerald-500",
  error: "bg-red-500",
  untested: "bg-amber-400",
  off: "",
  unavailable: "",
};

export function IntegrationCatalog({
  connections,
  builtIn,
  canEdit,
}: {
  connections: ConnectionView[];
  /** Status of providers configured elsewhere (WhatsApp, Midtrans, pixels…), keyed by chip id. */
  builtIn: Record<string, "connected" | "off">;
  canEdit: boolean;
}) {
  // The open panel lives in the URL (?connect=<provider>) so it survives the
  // refresh after saving and can be linked to directly.
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const openProvider = searchParams?.get("connect") ?? null;
  function setOpenProvider(next: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next) params.set("connect", next);
    else params.delete("connect");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  const byProvider = useMemo(() => new Map(connections.map((connection) => [connection.providerId, connection])), [connections]);

  function stateOf(chip: Chip): ChipState {
    if (chip.kind === "unavailable") return "unavailable";
    if (chip.kind === "builtin") return builtIn[chip.id] === "connected" ? "connected" : "off";
    const connection = byProvider.get(chip.providerId);
    if (!connection || !connection.enabled) return "off";
    if (connection.status === "ERROR") return "error";
    if (connection.status === "UNTESTED") return "untested";
    return "connected";
  }

  const connectedCount = GROUPS.flatMap((group) => group.chips).filter((chip) => stateOf(chip) === "connected").length;
  const provider = openProvider ? getProvider(openProvider) : undefined;

  return (
    <section aria-labelledby="catalog-title" className="space-y-[12px]">
      <div className="flex flex-wrap items-end justify-between gap-[8px]">
        <div>
          <h2 id="catalog-title" className="text-[15px] font-semibold text-kv-fg">Integration catalog</h2>
          <p className="mt-[2px] text-[12px] text-kv-muted-fg">
            Everything ready to use without extra plugins. {connectedCount} connected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px] text-[11px] text-kv-muted-fg">
          <Legend className="bg-emerald-500" label="Connected" />
          <Legend className="bg-amber-400" label="Not tested" />
          <Legend className="bg-red-500" label="Needs attention" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.key} className="rounded-[12px] border-[0.8px] border-kv-border bg-kv-card p-[16px]">
              <div className="mb-[12px] flex items-center gap-[10px]">
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-kv-secondary text-kv-fg">
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
                </span>
                <h3 className="text-[14px] font-semibold text-kv-fg">{group.title}</h3>
              </div>
              <div className="flex flex-wrap gap-[6px]">
                {group.chips.map((chip) => {
                  const state = stateOf(chip);
                  const label = chip.kind === "provider" ? getProvider(chip.providerId)?.name ?? chip.providerId : chip.label;
                  const className = cn(
                    "inline-flex h-[28px] items-center gap-[6px] rounded-[7px] border-[0.8px] px-[9px] text-[12px] transition-[border-color,background-color,color,box-shadow]",
                    state === "unavailable"
                      ? "cursor-not-allowed border-dashed border-kv-border text-kv-subtle"
                      : "border-kv-border bg-kv-card text-kv-secondary-fg hover:border-[#d1d5db] hover:bg-[#fcfcfc] hover:text-kv-fg hover:shadow-kv-hover",
                    state === "connected" && "text-kv-fg"
                  );
                  const content = (
                    <>
                      {DOT[state] ? <span aria-hidden className={cn("h-[6px] w-[6px] rounded-full", DOT[state])} /> : null}
                      {label}
                      <span className="sr-only">
                        {state === "connected" ? " (connected)" : state === "error" ? " (needs attention)" : state === "untested" ? " (not tested)" : state === "unavailable" ? " (not available)" : ""}
                      </span>
                    </>
                  );
                  if (chip.kind === "builtin") {
                    return (
                      <Link key={chip.id} href={chip.href} className={className} title="Set up in the existing settings">
                        {content}
                      </Link>
                    );
                  }
                  if (chip.kind === "unavailable") {
                    return (
                      <span key={chip.label} className={className} title={chip.reason}>
                        {content}
                      </span>
                    );
                  }
                  return (
                    <button key={chip.providerId} type="button" className={className} onClick={() => setOpenProvider(chip.providerId)}>
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={Boolean(provider)} onOpenChange={(open) => !open && setOpenProvider(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
          {provider ? (
            <ConnectPanel
              key={provider.id}
              provider={provider}
              connection={byProvider.get(provider.id) ?? null}
              othersInCategory={connections.filter(
                (item) => item.providerId !== provider.id && getProvider(item.providerId)?.category === provider.category
              ).length}
              canEdit={canEdit}
              onClose={() => setOpenProvider(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <span aria-hidden className={cn("h-[6px] w-[6px] rounded-full", className)} />
      {label}
    </span>
  );
}

function ConnectPanel({
  provider,
  connection,
  othersInCategory,
  canEdit,
  onClose,
}: {
  provider: ProviderDefinition;
  connection: ConnectionView | null;
  othersInCategory: number;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      provider.fields
        .filter((field) => field.type !== "secret")
        .map((field) => [field.key, connection?.config[field.key] ?? field.defaultValue ?? ""])
    )
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setErrors({}), [provider.id]);

  const dirty =
    Object.values(secrets).some((value) => value.trim()) ||
    provider.fields.some(
      (field) => field.type !== "secret" && (values[field.key] ?? "") !== (connection?.config[field.key] ?? field.defaultValue ?? "")
    );

  function save(then?: () => void) {
    setFormError(null);
    setErrors({});
    startTransition(async () => {
      const res = await saveIntegrationConnectionAction({
        providerId: provider.id,
        values: { ...values, ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim())) },
        enabled: connection ? undefined : true,
      });
      if (!res.ok) {
        setFormError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      setSecrets({});
      toast.success(connection ? `${provider.name} saved` : `${provider.name} connected`);
      router.refresh();
      then?.();
    });
  }

  function test(connectionId: string) {
    startTest(async () => {
      const res = await testIntegrationConnectionAction(connectionId);
      if (res.ok) toast.success(res.data?.detail ?? `${provider.name} is working`);
      else toast.error(res.error, { duration: 8000 });
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, then?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      router.refresh();
      then?.();
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <SheetHeader className="text-left">
        <SheetTitle className="flex items-center gap-[8px]">
          <PlugZap className="h-[18px] w-[18px]" /> {provider.name}
        </SheetTitle>
        <SheetDescription>{provider.tagline}</SheetDescription>
        {provider.docsUrl ? (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex w-fit items-center gap-[5px] text-[12px] font-medium text-kv-fg underline-offset-2 hover:underline"
          >
            <BookOpen className="h-[13px] w-[13px]" /> {provider.name} documentation
          </a>
        ) : null}
      </SheetHeader>

      {CATEGORY_NOTE[provider.category] ? (
        <p className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-muted/60 px-[12px] py-[10px] text-[12px] leading-[1.5] text-kv-muted-fg">
          {CATEGORY_NOTE[provider.category]}
        </p>
      ) : null}

      {connection ? (
        <div
          className={cn(
            "rounded-[10px] border-[0.8px] px-[12px] py-[10px] text-[12px] leading-[1.5]",
            connection.status === "CONNECTED"
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
              : connection.status === "ERROR"
                ? "border-red-200 bg-red-50/70 text-red-800"
                : "border-amber-200 bg-amber-50/70 text-amber-900"
          )}
        >
          <p className="font-medium">
            {connection.status === "CONNECTED"
              ? "Connected and verified"
              : connection.status === "ERROR"
                ? "Last check failed"
                : "Saved, not tested yet"}
            {connection.enabled ? "" : " · turned off"}
          </p>
          {connection.lastError ? <p className="mt-[2px] break-words">{connection.lastError}</p> : null}
          {connection.lastTestedAt ? (
            <p className="mt-[2px] opacity-80">Checked {new Date(connection.lastTestedAt).toLocaleString()}</p>
          ) : null}
          {connection.lastEventAt ? (
            <p className="opacity-80">Last webhook {new Date(connection.lastEventAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-[14px]"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {provider.fields.map((field) => {
          const id = `f-${provider.id}-${field.key}`;
          const hint = connection?.secretHints[field.key];
          return (
            <div key={field.key} className="space-y-[6px]">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? <span className="text-kv-muted-fg"> *</span> : null}
              </Label>
              {field.type === "select" ? (
                <Select
                  value={values[field.key] || field.defaultValue || ""}
                  onValueChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea
                  id={id}
                  rows={3}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((current) => ({ ...current, [field.key]: e.target.value }))}
                  disabled={!canEdit}
                />
              ) : field.type === "secret" ? (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  value={secrets[field.key] ?? ""}
                  onChange={(e) => setSecrets((current) => ({ ...current, [field.key]: e.target.value }))}
                  placeholder={hint ? `Stored ${hint}. Type to replace.` : field.placeholder}
                  disabled={!canEdit}
                  aria-invalid={Boolean(errors[field.key])}
                />
              ) : (
                <Input
                  id={id}
                  type={field.type === "email" ? "text" : field.type === "number" ? "text" : field.type === "url" ? "url" : "text"}
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((current) => ({ ...current, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  disabled={!canEdit}
                  aria-invalid={Boolean(errors[field.key])}
                />
              )}
              {errors[field.key] ? (
                <p className="text-[11px] text-kv-destructive">{errors[field.key]}</p>
              ) : field.help ? (
                <p className="text-[11px] leading-[1.45] text-kv-muted-fg">{field.help}</p>
              ) : null}
            </div>
          );
        })}

        {formError && !Object.keys(errors).length ? (
          <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
            {formError}
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap gap-[8px]">
            <Button type="submit" disabled={pending || (Boolean(connection) && !dirty)}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />}
              {connection ? "Save changes" : "Connect"}
            </Button>
            {connection ? (
              <Button
                type="button"
                variant="outline"
                disabled={testing || pending}
                onClick={() => (dirty ? save(() => test(connection.id)) : test(connection.id))}
              >
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
                {dirty ? "Save & test" : "Test connection"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>

      {connection && provider.webhook && connection.webhookUrl ? (
        <div className="space-y-[6px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-secondary/50 p-[12px]">
          <p className="text-[12px] font-medium text-kv-fg">{provider.webhook.label}</p>
          <div className="flex items-center gap-[6px]">
            <code className="min-w-0 flex-1 truncate rounded-[6px] bg-kv-card px-[8px] py-[6px] font-mono text-[11px] text-kv-secondary-fg" title={connection.webhookUrl}>
              {connection.webhookUrl}
            </code>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Copy webhook URL"
              onClick={() =>
                navigator.clipboard?.writeText(connection.webhookUrl!).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <p className="text-[11px] leading-[1.45] text-kv-muted-fg">{provider.webhook.help}</p>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => rotateIntegrationWebhookAction(connection.id), "New webhook URL issued. Update it in the provider dashboard.")}
            >
              <RefreshCw /> Issue a new URL
            </Button>
          ) : null}
        </div>
      ) : null}

      {connection && canEdit ? (
        <div className="space-y-[12px] border-t-[0.8px] border-kv-border pt-[14px]">
          <label className="flex items-center justify-between gap-[12px]">
            <span>
              <span className="block text-[13px] font-medium text-kv-fg">Enabled</span>
              <span className="block text-[11px] text-kv-muted-fg">Turn off to pause without deleting the credentials.</span>
            </span>
            <Switch
              checked={connection.enabled}
              disabled={pending}
              aria-label={`Enable ${provider.name}`}
              onCheckedChange={(next) =>
                run(() => setIntegrationEnabledAction(connection.id, next), next ? `${provider.name} turned on` : `${provider.name} turned off`)
              }
            />
          </label>
          {othersInCategory > 0 && provider.category !== "SHIPPING" && provider.category !== "INBOX" ? (
            <div className="flex items-center justify-between gap-[12px]">
              <span>
                <span className="block text-[13px] font-medium text-kv-fg">Default provider</span>
                <span className="block text-[11px] text-kv-muted-fg">
                  {connection.isPrimary ? "This one is used by default." : "Another provider is used by default."}
                </span>
              </span>
              {connection.isPrimary ? (
                <span className="text-[12px] font-medium text-kv-fg">Default</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => setPrimaryIntegrationAction(connection.id), `${provider.name} is now the default`)}
                >
                  Make default
                </Button>
              )}
            </div>
          ) : null}
          <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Disconnect {provider.name}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {provider.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored credentials are deleted and anything using {provider.name} stops immediately. You can connect it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (connection)
                  run(() => deleteIntegrationConnectionAction(connection.id), `${provider.name} disconnected`, () => {
                    setConfirmDelete(false);
                    onClose();
                  });
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
