"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Invalid email address"),
  phone: z.string().max(30).optional().or(z.literal("")),
});

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

function parse(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") || "").toLowerCase().trim(),
    phone: formData.get("phone") || "",
  });
}

export async function createCustomerAction(
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const exists = await prisma.customer.findUnique({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email: parsed.data.email,
      },
    },
    select: { id: true },
  });
  if (exists) {
    return {
      ok: false,
      error: "Customer already exists.",
      fieldErrors: { email: ["Already in use."] },
    };
  }

  await prisma.customer.create({
    data: {
      workspaceId: workspace.id,
      name: parsed.data.name.trim(),
      email: parsed.data.email,
      phone: parsed.data.phone?.trim() || null,
    },
  });
  revalidatePath("/dashboard/customers");
  return { ok: true };
}

export async function updateCustomerAction(
  customerId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { workspaceId: true },
  });
  if (!customer || customer.workspaceId !== workspace.id) {
    return { ok: false, error: "Customer not found." };
  }

  const conflict = await prisma.customer.findFirst({
    where: {
      workspaceId: workspace.id,
      email: parsed.data.email,
      NOT: { id: customerId },
    },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "Email already exists.",
      fieldErrors: { email: ["Already in use."] },
    };
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: parsed.data.name.trim(),
      email: parsed.data.email,
      phone: parsed.data.phone?.trim() || null,
    },
  });
  revalidatePath("/dashboard/customers");
  return { ok: true };
}

export async function deleteCustomerAction(
  customerId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { workspaceId: true },
  });
  if (!customer || customer.workspaceId !== workspace.id) {
    return { ok: false, error: "Customer not found." };
  }

  await prisma.customer.delete({ where: { id: customerId } });
  revalidatePath("/dashboard/customers");
  return { ok: true };
}
