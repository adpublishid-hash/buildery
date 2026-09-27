"use client";

import { useState, useTransition } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  XCircle,
} from "lucide-react";

import { checkCustomDomainDnsAction } from "@/lib/actions/domain";
import {
  dnsHostLabel,
  isApexDomain,
  isValidDomain,
  normalizeDomain,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DnsState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "done";
      pointsHere: boolean;
      ownershipVerified: boolean;
      sslActive: boolean;
      aRecords: string[];
      cname: string | null;
      targetIp: string;
    }
  | { status: "error"; message: string };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Record({ type, host, value }: { type: string; host: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
      <span className="font-semibold text-zinc-500">{type}</span>
      <span className="truncate font-mono text-zinc-800 dark:text-zinc-200">
        <span className="text-zinc-400">{host}</span> → {value}
      </span>
      <CopyButton value={value} />
    </div>
  );
}

export function CustomDomainField({
  value,
  onChange,
  savedDomain,
  workspaceId,
  verificationToken,
  domainStatus,
  sslStatus,
  error,
  disabled,
  serverIp,
  platformDomain,
}: {
  value: string;
  onChange: (value: string) => void;
  savedDomain: string;
  workspaceId: string;
  verificationToken: string | null;
  domainStatus: string;
  sslStatus: string;
  error?: string;
  disabled?: boolean;
  serverIp: string;
  platformDomain: string;
}) {
  const [dns, setDns] = useState<DnsState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const normalized = normalizeDomain(value);
  const valid = isValidDomain(normalized);
  const apex = valid && isApexDomain(normalized);
  const host = valid ? dnsHostLabel(normalized) : "@";
  const isSaved = Boolean(savedDomain) && savedDomain === normalized;

  const runCheck = () => {
    setDns({ status: "checking" });
    startTransition(async () => {
      const res = await checkCustomDomainDnsAction(workspaceId, normalized);
      if (!res.ok) {
        setDns({ status: "error", message: res.error });
      } else {
        setDns({
          status: "done",
          pointsHere: res.pointsHere,
          ownershipVerified: res.ownershipVerified,
          sslActive: res.sslActive,
          aRecords: res.aRecords,
          cname: res.cname,
          targetIp: res.targetIp,
        });
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="customDomain">Custom domain</Label>
      <Input
        id="customDomain"
        placeholder="store.example.com"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (value && value !== normalized) onChange(normalized);
        }}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pakai domain milikmu (mis. store.example.com). Tanpa http:// atau garis miring.
        </p>
      )}

      {valid ? (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
            <Globe className="h-3.5 w-3.5 text-zinc-400" />
            Pengaturan DNS untuk{" "}
            <span className="font-mono">{normalized}</span>
            {isSaved ? (
              <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Tersimpan
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                Belum disimpan
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Record type="A" host={host} value={serverIp} />
            {!apex ? (
              <>
                <p className="text-center text-[10px] text-zinc-400">— atau —</p>
                <Record type="CNAME" host={host} value={platformDomain} />
              </>
            ) : null}
            {verificationToken ? (
              <Record type="TXT" host={`_buildery-verification.${normalized}`} value={`buildery-verification=${verificationToken}`} />
            ) : null}
          </div>

          <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
            {apex
              ? "Domain root hanya mendukung A record. Tambahkan record di atas pada penyedia DNS-mu."
              : "Tambahkan salah satu record di atas. CNAME paling mudah untuk subdomain."}{" "}
            Simpan domain lalu tambahkan TXT verifikasi. Domain baru aktif setelah arah DNS dan kepemilikan berhasil diverifikasi.
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runCheck}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Cek DNS
            </Button>
            {dns.status === "done" ? (
              dns.pointsHere && dns.ownershipVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Domain terverifikasi{dns.sslActive ? " · HTTPS aktif" : " · HTTPS diproses"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <XCircle className="h-4 w-4" /> Belum mengarah ke{" "}
                  {dns.targetIp}
                </span>
              )
            ) : null}
            {dns.status === "error" ? (
              <span className="text-xs text-red-600">{dns.message}</span>
            ) : null}
          </div>

          {dns.status === "done" && !dns.pointsHere ? (
            <p className="text-[11px] text-zinc-500">
              {dns.aRecords.length
                ? `Saat ini mengarah ke: ${dns.aRecords.join(", ")}.`
                : dns.cname
                  ? `CNAME saat ini: ${dns.cname}.`
                  : "Belum ada record A/CNAME terbaca (DNS mungkin belum propagasi)."}
            </p>
          ) : null}
          {isSaved ? (
            <p className="text-[11px] text-zinc-500">Status domain: {domainStatus} · HTTPS: {sslStatus}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
