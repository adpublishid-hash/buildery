// Client-safe: which catalog provider backs each inbox channel, and its name.

import type { InboxChannel } from "@prisma/client";

export const CHANNEL_PROVIDER: Record<Exclude<InboxChannel, "WHATSAPP">, string> = {
  TELEGRAM: "telegram_inbox",
  MESSENGER: "messenger",
  INSTAGRAM: "instagram",
  WEBCHAT: "webchat",
};

export const PROVIDER_CHANNEL: Record<string, Exclude<InboxChannel, "WHATSAPP">> = Object.fromEntries(
  Object.entries(CHANNEL_PROVIDER).map(([channel, provider]) => [provider, channel])
) as Record<string, Exclude<InboxChannel, "WHATSAPP">>;

export const CHANNEL_LABEL: Record<InboxChannel, string> = {
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Web chat",
};

export const INBOX_CHANNELS = Object.keys(CHANNEL_LABEL) as InboxChannel[];
