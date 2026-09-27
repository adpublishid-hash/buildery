import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { rateLimitByIp } from "@/lib/rate-limit";
import { issueVerificationCode } from "@/lib/verification";
import { reportError } from "@/lib/error-reporting";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimitByIp("resend-verification", 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { message: "Terlalu banyak permintaan kode. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const code = await issueVerificationCode(session.user.email);
    return NextResponse.json({
      ok: true,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    });
  } catch (error) {
    reportError("verify resend failed", error);
    return NextResponse.json(
      { message: "Kode baru belum bisa dikirim. Coba lagi." },
      { status: 500 }
    );
  }
}
