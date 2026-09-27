"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { loadStoredCart, mergeCarts, persistCart } from "@/lib/cart-store";
import { CART_COOKIE, readCart, type Cart } from "@/lib/store";
import { VISITOR_COOKIE } from "@/lib/analytics-visitor";
import {
  memberLoginSchema,
  memberRegisterSchema,
} from "@/lib/zod";
import {
  clearMemberSession,
  setMemberSession,
} from "@/lib/member-auth";
import {
  consumeMemberClaimCode,
  issueMemberClaimCode,
  issueMemberResetCode,
  consumeMemberResetCode,
} from "@/lib/member-verification";
import { rateLimitByIp, rateLimitShared } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-reporting";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type MemberAuthResult = {
  customerId?: string;
  verificationRequired?: boolean;
  devCode?: string;
};

export async function registerMemberAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<MemberAuthResult>> {
  const limit = await rateLimitByIp("member-register", 8, 15 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again later." };

  const parsed = memberRegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || "",
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.customer.findUnique({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    select: { id: true, password: true },
  });
  if (existing?.password) {
    return {
      ok: false,
      error: "A member account with that email already exists. Please log in.",
      fieldErrors: { email: ["This email already has a member login."] },
    };
  }

  const password = await bcrypt.hash(parsed.data.password, 10);
  const verificationCode = String(formData.get("verificationCode") || "");
  if (!verificationCode) {
    try {
      const devCode = await issueMemberClaimCode(
        workspace.id,
        workspace.name,
        email
      );
      return {
        ok: true,
        data: { verificationRequired: true, devCode },
      };
    } catch (error) {
      reportError("member-register verification failed", error);
      return {
        ok: false,
        error: "We could not send the verification code. Please try again.",
      };
    }
  }

  const verified = await consumeMemberClaimCode(
    workspace.id,
    email,
    verificationCode
  );
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      fieldErrors: { verificationCode: [verified.error] },
    };
  }

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name.trim(),
          phone: parsed.data.phone?.trim() || null,
          password,
          lastLoginAt: new Date(),
        },
        select: { id: true },
      })
    : await prisma.customer.create({
        data: {
          workspaceId: workspace.id,
          name: parsed.data.name.trim(),
          email,
          phone: parsed.data.phone?.trim() || null,
          password,
          lastLoginAt: new Date(),
        },
        select: { id: true },
      });

  await setMemberSession({
    workspaceId: workspace.id,
    customerId: customer.id,
  });
  // Registering mid-checkout must not lose what is already in the cart.
  await mergeCartOnSignIn(workspace.id, customer.id);
  revalidatePath(`/site/${workspaceSlug}`);
  return { ok: true, data: { customerId: customer.id } };
}

/**
 * Brings the cart the shopper had in this browser together with the one they
 * left on another device.
 *
 * Signing in is the only moment both are known, and the only place a cookie can
 * be written — a page render cannot set one.
 */
async function mergeCartOnSignIn(workspaceId: string, customerId: string) {
  const jar = cookies();
  const cookieCart = readCart();
  const stored = await loadStoredCart({ workspaceId, customerId });

  const local: Cart =
    cookieCart.workspaceId === workspaceId
      ? cookieCart
      : { workspaceId, items: [], couponCode: null };
  const merged = stored ? mergeCarts(local, stored) : local;

  if (merged.items.length > 0 || merged.couponCode) {
    jar.set(CART_COOKIE, JSON.stringify(merged), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  await persistCart(merged, {
    customerId,
    visitorId: jar.get(VISITOR_COOKIE)?.value ?? null,
  });
}

export async function loginMemberAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<MemberAuthResult>> {
  const parsed = memberLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const limit = await rateLimitShared(
    `member-login:${workspaceSlug}:${email}`,
    8,
    5 * 60 * 1000
  );
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again shortly." };

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  const customer = await prisma.customer.findUnique({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    select: { id: true, password: true },
  });
  if (!customer?.password) {
    return { ok: false, error: "No member login found for that email." };
  }

  const valid = await bcrypt.compare(parsed.data.password, customer.password);
  if (!valid) return { ok: false, error: "Invalid email or password." };

  await prisma.customer.update({
    where: { id: customer.id },
    data: { lastLoginAt: new Date() },
  });
  await setMemberSession({
    workspaceId: workspace.id,
    customerId: customer.id,
  });
  await mergeCartOnSignIn(workspace.id, customer.id);
  revalidatePath(`/site/${workspaceSlug}`);
  return { ok: true, data: { customerId: customer.id } };
}

export async function logoutMemberAction(
  workspaceSlug: string
): Promise<ActionResult> {
  clearMemberSession();
  revalidatePath(`/site/${workspaceSlug}`);
  return { ok: true };
}

export async function requestMemberPasswordResetAction(
  workspaceSlug: string,
  emailInput: string
): Promise<ActionResult<MemberAuthResult>> {
  const email = emailInput.toLowerCase().trim();
  const limit = await rateLimitShared(`member-reset:${workspaceSlug}:${email}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again later." };
  const workspace = await prisma.workspace.findFirst({ where: { slug: workspaceSlug, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!workspace) return { ok: false, error: "Workspace not found." };
  const customer = await prisma.customer.findUnique({ where: { workspaceId_email: { workspaceId: workspace.id, email } }, select: { id: true, password: true } });
  let devCode: string | undefined;
  if (customer?.password) devCode = await issueMemberResetCode(workspace.id, workspace.name, email);
  return { ok: true, data: { verificationRequired: true, devCode } };
}

export async function resetMemberPasswordAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const code = String(formData.get("verificationCode") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8 || password.length > 72) return { ok: false, error: "Password must be 8 to 72 characters." };
  const workspace = await prisma.workspace.findFirst({ where: { slug: workspaceSlug, status: "ACTIVE" }, select: { id: true } });
  if (!workspace) return { ok: false, error: "Workspace not found." };
  const verified = await consumeMemberResetCode(workspace.id, email, code);
  if (!verified.ok) return { ok: false, error: verified.error };
  const customer = await prisma.customer.update({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    data: { password: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } },
    select: { id: true, sessionVersion: true },
  });
  await setMemberSession({ workspaceId: workspace.id, customerId: customer.id, version: customer.sessionVersion });
  return { ok: true };
}
