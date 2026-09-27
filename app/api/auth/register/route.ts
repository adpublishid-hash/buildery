import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/zod";
import { rateLimitByIp } from "@/lib/rate-limit";
import { issueVerificationCode } from "@/lib/verification";
import { reportError } from "@/lib/error-reporting";

export async function POST(req: Request) {
  try {
    // Throttle account creation — 5 per 15 minutes per IP.
    const limit = await rateLimitByIp("register", 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { message: "Too many sign-up attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Invalid input",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, phone, password } = parsed.data;
    const email = parsed.data.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { message: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashed,
        role: "CUSTOMER",
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    let verificationSent = true;
    try {
      await issueVerificationCode(email);
    } catch (error) {
      verificationSent = false;
      reportError("REGISTER verification code send failed", error);
    }

    return NextResponse.json({ user, verificationSent }, { status: 201 });
  } catch (err) {
    reportError("REGISTER", err);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
