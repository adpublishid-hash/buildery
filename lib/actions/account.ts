"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { accountNameSchema, changePasswordSchema } from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Pengaturan akun milik pengguna sendiri.
 *
 * Sebelumnya tidak ada sama sekali: seluruh /dashboard/settings adalah level
 * workspace, dan satu-satunya tulisan ke tabel User di seluruh server action
 * adalah admin mengubah peran orang lain. Tidak ada cara bagi pemilik atau
 * anggota tim untuk mengganti namanya, apalagi passwordnya.
 */
export async function updateAccountNameAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/account");

  const parsed = accountNameSchema.safeParse({
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian yang ditandai.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function changePasswordAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/account");

  // Menebak password lama harus mahal, bukan gratis.
  const limit = await rateLimitShared(
    `account-password:${session.user.id}`,
    5,
    15 * 60 * 1000
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
    };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian yang ditandai.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });
  if (!user) redirect("/login");

  // Akun yang dibuat lewat OAuth belum punya password sama sekali; memasang
  // yang pertama tanpa memverifikasi apa pun akan membuat siapa pun yang
  // memegang sesi bisa mengambil alih login berbasis password.
  if (!user.password) {
    return {
      ok: false,
      error:
        "Akun ini masuk lewat penyedia login eksternal dan belum punya password. Gunakan fitur lupa password untuk memasangnya.",
    };
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) {
    return {
      ok: false,
      error: "Password saat ini salah.",
      fieldErrors: { currentPassword: ["Password saat ini salah."] },
    };
  }

  if (parsed.data.currentPassword === parsed.data.password) {
    return {
      ok: false,
      error: "Password baru harus berbeda dari password sekarang.",
      fieldErrors: { password: ["Harus berbeda dari password sekarang."] },
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(parsed.data.password, 10) },
  });

  revalidatePath("/dashboard/account");
  return { ok: true };
}
