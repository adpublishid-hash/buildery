"use client";

import { useState } from "react";
import { ArrowRight, Boxes, CircleCheck, FileText, GraduationCap, Store } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";
import { PUBLIC_SITE_DOMAIN } from "@/lib/public-url";

const PERKS = [
  { icon: FileText, label: "Bangun halaman dengan blok" },
  { icon: Store, label: "Jual produk dan terima order" },
  { icon: GraduationCap, label: "Publikasikan kursus dan blog" },
] as const;

/** Onboarding step 2: a short welcome, then the first-workspace form. */
export function OnboardingWizard({ userName }: { userName: string }) {
  const [started, setStarted] = useState(false);

  if (started) {
    return (
      <AuthCard
        key="form"
        eyebrow="Langkah 2 dari 2"
        icon={Boxes}
        title="Beri nama workspace"
        description={`Pilih nama dan URL publik yang rapi di ${PUBLIC_SITE_DOMAIN}.`}
      >
        <CreateWorkspaceForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      key="intro"
      eyebrow="Langkah 2 dari 2"
      icon={Boxes}
      title={`Selamat datang, ${userName}`}
      description={`Workspace menyimpan halaman, produk, kursus, dan pelanggan di satu tempat. Website pertamamu tayang di subdomain ${PUBLIC_SITE_DOMAIN}.`}
    >
      <div className="space-y-[14px]">
        <p className="flex items-center gap-[6px] text-[12px] text-kv-muted-fg">
          <CircleCheck className="h-[14px] w-[14px] text-kv-success" strokeWidth={1.8} />
          Email terverifikasi
        </p>

        <ul className="overflow-hidden rounded-[8px] border-[0.8px] border-kv-border">
          {PERKS.map((perk) => {
            const Icon = perk.icon;
            return (
              <li
                key={perk.label}
                className="flex items-center gap-[10px] border-b border-black/[0.06] px-[12px] py-[10px] text-[13px] text-kv-cell last:border-b-0"
              >
                <Icon className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
                {perk.label}
              </li>
            );
          })}
        </ul>

        <Button size="lg" className="w-full" onClick={() => setStarted(true)}>
          Buat workspace
          <ArrowRight />
        </Button>
      </div>
    </AuthCard>
  );
}
