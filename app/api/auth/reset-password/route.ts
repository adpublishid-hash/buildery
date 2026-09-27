import { NextResponse } from "next/server";
import { z } from "zod";

import { resetPassword } from "@/lib/password-reset";
import { rateLimitByIp } from "@/lib/rate-limit";

const schema = z
  .object({
    email: z.string().email("Alamat email tidak valid"),
    token: z.string().min(20, "Token tidak valid"),
    password: z.string().min(8, "Password minimal 8 karakter").max(100),
    confirmPassword: z.string().min(1, "Ulangi password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Password tidak sama",
  });

export async function POST(req: Request) {
  const limit = await rateLimitByIp("reset-password", 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { message: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Periksa kembali password baru kamu.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const result = await resetPassword(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ message: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
