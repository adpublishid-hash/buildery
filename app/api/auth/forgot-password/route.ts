import { NextResponse } from "next/server";
import { z } from "zod";

import { requestPasswordReset } from "@/lib/password-reset";
import { rateLimitByIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Alamat email tidak valid"),
});

export async function POST(req: Request) {
  const limit = await rateLimitByIp("forgot-password", 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { message: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Email tidak valid.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  await requestPasswordReset(parsed.data.email);
  return NextResponse.json({ ok: true });
}
