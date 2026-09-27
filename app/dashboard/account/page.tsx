import { redirect } from "next/navigation";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm, PasswordForm } from "@/components/account/account-forms";

export const metadata = { title: "Akun · My Landing" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/account");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, emailVerified: true, password: true },
  });
  if (!user) redirect("/login");

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Akun"
        description="Profil dan keamanan akunmu sendiri, terpisah dari pengaturan workspace."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>
            Nama ini yang muncul di daftar anggota workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name ?? ""} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Email dipakai untuk masuk, jadi tidak bisa diganti sendiri dari
            sini — menggantinya tanpa verifikasi ulang akan memindahkan akses
            login ke alamat yang belum tentu milikmu. Hubungi admin bila perlu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {user.email}
          </p>
          {user.emailVerified ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <BadgeCheck className="h-3.5 w-3.5" />
              Terverifikasi
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5" />
              Belum diverifikasi
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Mengganti password tidak mengakhiri sesi di perangkat lain. Kalau
            kamu menduga akun disalahgunakan, keluar dari perangkat itu juga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm hasPassword={Boolean(user.password)} />
        </CardContent>
      </Card>
    </div>
  );
}
