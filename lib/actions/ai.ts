"use server";

import { redirect } from "next/navigation";
import type { ProductType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { describeAiError, type AiUsage } from "@/lib/ai/client";
import {
  AI_RATE_LIMIT,
  AI_RATE_WINDOW_MS,
  isAiConfigured,
} from "@/lib/ai/config";
import { generatePageSections } from "@/lib/ai/page-sections";
import {
  generateProductCopy,
  type ProductCopy,
} from "@/lib/ai/product-copy";
import type { BlockInput } from "@/lib/blocks/schema";
import { canInWorkspace } from "@/lib/permissions";
import { rateLimitShared } from "@/lib/rate-limit";
import { getUserPlan, planHasFeature } from "@/lib/saas-limits";
import { getCurrentWorkspace } from "@/lib/workspace";
import { reportError } from "@/lib/error-reporting";

export type GenerateSectionsActionResult =
  | {
      ok: true;
      pageTitle: string;
      blocks: BlockInput[];
      skipped: number;
    }
  | { ok: false; error: string };

export type GenerateProductCopyActionResult =
  | { ok: true; copy: ProductCopy }
  | { ok: false; error: string };

/** Keeps a runaway prompt from becoming a runaway bill. */
const MAX_BRIEF_LENGTH = 1200;
const MIN_BRIEF_LENGTH = 8;

type AiGate =
  | { ok: true; workspace: { id: string; name: string; language: string } }
  | { ok: false; error: string };

/**
 * The four checks every AI surface shares, in cost order: permission first,
 * then platform configuration, then the plan, then the hourly budget — so a
 * request that would be rejected anyway never reaches the rate-limit write.
 */
async function requireAiAccess(action: string): Promise<AiGate> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Kamu tidak punya akses untuk mengedit konten." };
  }

  if (!isAiConfigured()) {
    return {
      ok: false,
      error:
        "AI belum diaktifkan di server ini. Minta admin mengisi ANTHROPIC_API_KEY.",
    };
  }

  const plan = await getUserPlan(current.workspace.createdById);
  if (!planHasFeature(plan, "aiAssistant")) {
    return {
      ok: false,
      error: `Paket ${plan.name} belum termasuk AI assistant. Upgrade untuk memakai fitur ini.`,
    };
  }

  const limit = await rateLimitShared(
    `ai:${action}:${current.workspace.id}`,
    AI_RATE_LIMIT,
    AI_RATE_WINDOW_MS
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: `Batas ${AI_RATE_LIMIT} permintaan AI per jam tercapai. Coba lagi dalam ${Math.ceil(
        limit.retryAfter / 60
      )} menit.`,
    };
  }

  return {
    ok: true,
    workspace: {
      id: current.workspace.id,
      name: current.workspace.name,
      language: current.workspace.language,
    },
  };
}

/**
 * Generates page sections from a plain-language brief. The result is
 * validated block data, ready for the builder to wrap with ids.
 */
export async function generatePageSectionsAction(
  brief: string
): Promise<GenerateSectionsActionResult> {
  const trimmed = brief.trim();
  if (trimmed.length < MIN_BRIEF_LENGTH) {
    return {
      ok: false,
      error: "Tulis deskripsi halaman yang kamu mau, minimal satu kalimat.",
    };
  }
  if (trimmed.length > MAX_BRIEF_LENGTH) {
    return {
      ok: false,
      error: `Deskripsi terlalu panjang (maks ${MAX_BRIEF_LENGTH} karakter).`,
    };
  }

  const gate = await requireAiAccess("sections");
  if (!gate.ok) return gate;
  const { workspace } = gate;

  try {
    const result = await generatePageSections({
      brief: trimmed,
      workspaceName: workspace.name,
      language: workspace.language === "EN" ? "en" : "id",
    });

    logUsage("sections", workspace.id, result.usage);

    return {
      ok: true,
      pageTitle: result.pageTitle,
      blocks: result.blocks,
      skipped: result.skipped,
    };
  } catch (error) {
    reportError("ai section generation failed", error);
    return { ok: false, error: describeAiError(error) };
  }
}

/**
 * Drafts the description, detail copy, and SEO fields for one product. The
 * seller keeps whatever they had — the form only fills empty fields unless
 * they explicitly choose to overwrite.
 */
export async function generateProductCopyAction(input: {
  name: string;
  hint: string;
  type: ProductType;
  price: string;
}): Promise<GenerateProductCopyActionResult> {
  const name = input.name.trim();
  if (name.length < 2) {
    return { ok: false, error: "Isi dulu nama produknya." };
  }

  const gate = await requireAiAccess("product-copy");
  if (!gate.ok) return gate;
  const { workspace } = gate;

  try {
    const result = await generateProductCopy({
      name,
      hint: input.hint.trim().slice(0, MAX_BRIEF_LENGTH),
      type: input.type,
      price: input.price.trim().slice(0, 40),
      workspaceName: workspace.name,
      language: workspace.language === "EN" ? "en" : "id",
    });

    logUsage("product-copy", workspace.id, result.usage);

    return {
      ok: true,
      copy: {
        description: result.description,
        details: result.details,
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
      },
    };
  } catch (error) {
    reportError("ai product copy generation failed", error);
    return { ok: false, error: describeAiError(error) };
  }
}

/** Token spend is the operator's cost centre — keep it greppable in the logs. */
function logUsage(action: string, workspaceId: string, usage: AiUsage) {
  console.info(
    `[ai] ${action} workspace=${workspaceId} in=${usage.promptTokens} ` +
      `out=${usage.completionTokens} total=${usage.totalTokens}`
  );
}
