import "server-only";

import { createHmac } from "node:crypto";

import type {
  Form,
  FormDelivery,
  FormField,
  FormSubmission,
  FormVersion,
} from "@prisma/client";

import { assertPublicHttpUrl } from "@/lib/outbound-url";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { readSubmissionCell } from "@/lib/forms";
import { parsePublishedFormFields } from "@/lib/form-publication";
import {
  getWorkspaceTelegramConfig,
  sendTelegramMessage,
} from "@/lib/telegram";

const WEBHOOK_TIMEOUT_MS = 8000;

/** Give up after this many tries; the row stays visible as a hard failure. */
export const FORM_DELIVERY_MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MINUTES = 60;

type SubmissionWithRefs = Pick<
  FormSubmission,
  | "id"
  | "formId"
  | "workspaceId"
  | "data"
  | "createdAt"
  | "ipAddress"
  | "userAgent"
  | "referrer"
> & {
  form: Pick<Form, "title" | "slug" | "notifyEmail" | "webhookUrl"> & {
    fields: Array<Pick<FormField, "label" | "name" | "type">>;
  };
};

type SubmissionWithVersion = SubmissionWithRefs & {
  formVersion?: Pick<
    FormVersion,
    "title" | "slug" | "notifyEmail" | "webhookUrl" | "fields"
  > | null;
};

export type FormDeliveryResult = { ok: true } | { ok: false; error: string };

type DeliveryRow = Pick<FormDelivery, "id" | "kind" | "target" | "attempts">;

export function submissionDeliverySnapshot(
  submission: SubmissionWithVersion
): SubmissionWithRefs {
  if (!submission.formVersion) return submission;
  return {
    ...submission,
    form: {
      ...submission.form,
      title: submission.formVersion.title,
      slug: submission.formVersion.slug,
      notifyEmail: submission.formVersion.notifyEmail,
      webhookUrl: submission.formVersion.webhookUrl,
      fields: parsePublishedFormFields(submission.formVersion.fields),
    },
  };
}

/**
 * Records a pending delivery row per configured channel, then sends each one.
 *
 * The send is a fast path, not the guarantee: a row that stays PENDING
 * because the process died mid-send, and a row that ends FAILED, are both
 * picked up later by the FORM_DELIVERY_RETRY sweep. That is what makes it
 * safe to run this without blocking the visitor.
 */
export async function dispatchSubmissionDeliveries(
  submission: SubmissionWithRefs,
  workspaceName: string
) {
  const { form } = submission;

  const targets: Array<{
    kind: "EMAIL" | "WEBHOOK" | "TELEGRAM";
    target: string;
  }> = [];
  if (form.notifyEmail) targets.push({ kind: "EMAIL", target: form.notifyEmail });
  if (form.webhookUrl) targets.push({ kind: "WEBHOOK", target: form.webhookUrl });
  const telegramConfig = await getWorkspaceTelegramConfig(submission.workspaceId);
  if (telegramConfig) {
    targets.push({ kind: "TELEGRAM", target: telegramConfig.chatId });
  }
  if (targets.length === 0) return;

  const rows = await prisma.$transaction(
    targets.map((t) =>
      prisma.formDelivery.create({
        data: {
          submissionId: submission.id,
          kind: t.kind,
          target: t.target,
          status: "PENDING",
          maxAttempts: FORM_DELIVERY_MAX_ATTEMPTS,
        },
      })
    )
  );

  await Promise.all(
    rows.map(async (row) => {
      const result = await performDelivery(row, submission, workspaceName);
      await recordDeliveryOutcome(row, result);
    })
  );
}

/**
 * Sends one delivery. Never throws and never touches the row — the caller
 * decides how to record the outcome, which is what lets the inline dispatch
 * and the retry sweep share this.
 */
export async function performDelivery(
  row: DeliveryRow,
  submission: SubmissionWithRefs,
  workspaceName: string
): Promise<FormDeliveryResult> {
  try {
    if (row.kind === "EMAIL") {
      return await sendDeliveryEmail(submission, workspaceName, row.target);
    }
    if (row.kind === "TELEGRAM") {
      return await sendDeliveryTelegram(submission, workspaceName);
    }
    return await sendDeliveryWebhook(submission, workspaceName, row.target);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delivery failed.",
    };
  }
}

/**
 * Writes the result of one attempt, scheduling the next one on failure until
 * the row runs out of attempts.
 */
export async function recordDeliveryOutcome(
  row: DeliveryRow,
  result: FormDeliveryResult,
  now = new Date()
) {
  if (result.ok) {
    await prisma.formDelivery.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        attempts: { increment: 1 },
        lastError: null,
        lastTriedAt: now,
        nextAttemptAt: null,
      },
    });
    return;
  }

  const attempt = row.attempts + 1;
  const exhausted = attempt >= FORM_DELIVERY_MAX_ATTEMPTS;
  await prisma.formDelivery.update({
    where: { id: row.id },
    data: {
      status: "FAILED",
      attempts: { increment: 1 },
      lastError: result.error.slice(0, 500),
      lastTriedAt: now,
      // A null next attempt is how the sweep knows to leave it alone.
      nextAttemptAt: exhausted ? null : nextFormDeliveryAttemptAt(attempt, now),
    },
  });
}

export function nextFormDeliveryAttemptAt(attempts: number, now = new Date()) {
  const minutes = Math.min(2 ** Math.max(0, attempts), MAX_BACKOFF_MINUTES);
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function plainSummary(submission: SubmissionWithRefs): string {
  const lines = submission.form.fields.map((field) => {
    const value = readSubmissionCell(submission.data, field.name) || "—";
    return `${field.label}: ${value}`;
  });
  return lines.join("\n");
}

function htmlSummary(submission: SubmissionWithRefs): string {
  const rows = submission.form.fields
    .map((field) => {
      const value = readSubmissionCell(submission.data, field.name) || "—";
      const safeLabel = escapeHtml(field.label);
      const safeValue = escapeHtml(value).replace(/\n/g, "<br>");
      return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;text-transform:uppercase">${safeLabel}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${safeValue}</td></tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:system-ui,sans-serif">${rows}</table>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendDeliveryEmail(
  submission: SubmissionWithRefs,
  workspaceName: string,
  to: string
): Promise<FormDeliveryResult> {
  const subject = `New submission · ${submission.form.title}`;
  const text = `${workspaceName} — ${submission.form.title}\n\nReceived ${submission.createdAt.toISOString()}\n\n${plainSummary(submission)}`;
  const html = `<p style="font-family:system-ui,sans-serif;color:#444"><strong>${escapeHtml(submission.form.title)}</strong> received a new submission.</p>${htmlSummary(submission)}`;

  const replyFromValue = findEmailValue(submission);
  const result = await sendEmail({
    workspaceId: submission.workspaceId,
    to,
    subject,
    text,
    html,
    replyTo: replyFromValue ?? undefined,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function sendDeliveryTelegram(
  submission: SubmissionWithRefs,
  workspaceName: string
): Promise<FormDeliveryResult> {
  const config = await getWorkspaceTelegramConfig(submission.workspaceId);
  if (!config) {
    return { ok: false, error: "Telegram notifications are disabled." };
  }

  const subject = `New submission · ${submission.form.title}`;
  const text = [
    subject,
    `${workspaceName} received a new form submission.`,
    `Received: ${submission.createdAt.toISOString()}`,
    "",
    plainSummary(submission),
  ].join("\n");

  const result = await sendTelegramMessage(config, text);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function findEmailValue(submission: SubmissionWithRefs): string | null {
  const emailField = submission.form.fields.find((f) => f.type === "EMAIL");
  if (!emailField) return null;
  const value = readSubmissionCell(submission.data, emailField.name).trim();
  if (!value) return null;
  return value;
}

/**
 * Secret the webhook signature is derived from. Falls back to the auth secret
 * so signing works without extra configuration; set WEBHOOK_SIGNING_SECRET to
 * rotate it independently.
 */
function signingSecret() {
  return (
    process.env.WEBHOOK_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "buildery-local-webhook-secret"
  );
}

/**
 * Per-workspace signature over `timestamp.body`. The timestamp is inside the
 * signed material so a captured delivery cannot be replayed later with a
 * fresh header.
 */
export function webhookSignature(
  workspaceId: string,
  timestamp: string,
  body: string
) {
  const key = createHmac("sha256", signingSecret())
    .update(`workspace:${workspaceId}`)
    .digest();
  return createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
}

async function sendDeliveryWebhook(
  submission: SubmissionWithRefs,
  workspaceName: string,
  url: string
): Promise<FormDeliveryResult> {
  // Re-checked here, not only when the form was saved: the hostname may have
  // been repointed at a private address since.
  const checked = await assertPublicHttpUrl(url);
  if (!checked.ok) return { ok: false, error: checked.error };

  const payload = {
    event: "form.submission.created",
    submission: {
      id: submission.id,
      formId: submission.formId,
      formTitle: submission.form.title,
      formSlug: submission.form.slug,
      workspaceId: submission.workspaceId,
      workspaceName,
      createdAt: submission.createdAt.toISOString(),
      data: submission.data,
      ipAddress: submission.ipAddress,
      userAgent: submission.userAgent,
      referrer: submission.referrer,
    },
  };

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(checked.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MyLanding-Webhook/1.0",
        "X-Buildery-Timestamp": timestamp,
        "X-Buildery-Signature": `sha256=${webhookSignature(
          submission.workspaceId,
          timestamp,
          body
        )}`,
      },
      body,
      signal: controller.signal,
      // Following a 302 would hand back the SSRF we just closed: the
      // redirect target is never checked. Treat one as a misconfiguration.
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        error: "Webhook membalas redirect; arahkan langsung ke URL final.",
      };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retries every failed delivery for one submission, on an operator's say-so.
 * Unlike the sweep this ignores the backoff schedule and the attempt ceiling:
 * a human pressing the button has usually just fixed whatever was broken.
 */
export async function retrySubmissionDeliveries(
  submissionId: string,
  workspaceId: string
): Promise<{ retried: number }> {
  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    include: {
      form: { include: { fields: { orderBy: { order: "asc" } } } },
      formVersion: true,
      workspace: { select: { name: true } },
    },
  });
  if (!submission || submission.workspaceId !== workspaceId) return { retried: 0 };

  const failed = await prisma.formDelivery.findMany({
    where: { submissionId, status: "FAILED" },
    select: { id: true, kind: true, target: true, attempts: true },
  });
  if (failed.length === 0) return { retried: 0 };

  await Promise.all(
    failed.map(async (row) => {
      const result = await performDelivery(
        row,
        submissionDeliverySnapshot(submission),
        submission.workspace.name
      );
      if (result.ok) {
        await recordDeliveryOutcome(row, result);
        return;
      }
      // Keep the manual retry from burning the automatic budget: record the
      // failure but leave the attempt counter where the sweep expects it.
      await prisma.formDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          lastError: result.error.slice(0, 500),
          lastTriedAt: new Date(),
        },
      });
    })
  );
  return { retried: failed.length };
}
