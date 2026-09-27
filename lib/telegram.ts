import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 8000;
const TELEGRAM_MAX_TEXT_LENGTH = 4096;

type Tx = Prisma.TransactionClient | PrismaClient;

export type TelegramConfig = {
  botToken: string;
  chatId: string;
  messageThreadId?: string | null;
};

export type TelegramSendResult =
  | { ok: true; provider: "telegram"; messageId?: number }
  | { ok: false; error: string };

export async function getWorkspaceTelegramConfig(
  workspaceId: string,
  db: Tx = prisma
): Promise<TelegramConfig | null> {
  const integration = await db.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      telegramEnabled: true,
      telegramBotToken: true,
      telegramChatId: true,
      telegramMessageThreadId: true,
    },
  });

  if (
    !integration?.telegramEnabled ||
    !integration.telegramBotToken ||
    !integration.telegramChatId
  ) {
    return null;
  }

  return {
    botToken: integration.telegramBotToken,
    chatId: integration.telegramChatId,
    messageThreadId: integration.telegramMessageThreadId,
  };
}

export async function sendWorkspaceTelegramMessage(
  workspaceId: string,
  text: string,
  db: Tx = prisma
) {
  const config = await getWorkspaceTelegramConfig(workspaceId, db);
  if (!config) return { ok: false, error: "Telegram notifications disabled." };
  return sendTelegramMessage(config, text);
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  options: { disableNotification?: boolean } = {}
): Promise<TelegramSendResult> {
  const message = text.trim().slice(0, TELEGRAM_MAX_TEXT_LENGTH);
  if (!message) return { ok: false, error: "Telegram message is empty." };

  const body: Record<string, unknown> = {
    chat_id: config.chatId,
    text: message,
    disable_notification: Boolean(options.disableNotification),
  };

  const threadId = Number(config.messageThreadId);
  if (config.messageThreadId && Number.isSafeInteger(threadId) && threadId > 0) {
    body.message_thread_id = threadId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${TELEGRAM_API_BASE}/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const payload = await readTelegramResponse(res);
    if (!res.ok || !payload.ok) {
      return {
        ok: false,
        error:
          payload.description?.slice(0, 500) ||
          `Telegram API returned HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      provider: "telegram",
      messageId: payload.result?.message_id,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Telegram request failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readTelegramResponse(res: Response): Promise<{
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}> {
  try {
    const json = await res.json();
    if (!json || typeof json !== "object") return { ok: false };
    const root = json as Record<string, unknown>;
    const result =
      root.result && typeof root.result === "object" && !Array.isArray(root.result)
        ? (root.result as Record<string, unknown>)
        : null;
    return {
      ok: root.ok === true,
      description:
        typeof root.description === "string" ? root.description : undefined,
      result:
        typeof result?.message_id === "number"
          ? { message_id: result.message_id }
          : undefined,
    };
  } catch {
    return { ok: false };
  }
}
