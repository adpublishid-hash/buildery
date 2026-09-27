import "server-only";

import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

export type SmtpEmailConfig = {
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  timeoutMs?: number;
};

export type SmtpEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

type SmtpResponse = {
  code: number;
  lines: string[];
};

type LineReader = {
  readResponse: () => Promise<SmtpResponse>;
  dispose: () => void;
};

export async function sendSmtpEmail(
  config: SmtpEmailConfig,
  message: SmtpEmailMessage
) {
  const timeoutMs = config.timeoutMs ?? 12_000;
  let socket: net.Socket = config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
        timeout: timeoutMs,
      })
    : net.connect({ host: config.host, port: config.port, timeout: timeoutMs });

  let reader = createLineReader(socket, timeoutMs);

  try {
    await expect(reader.readResponse(), [220], "SMTP greeting");
    await command(socket, reader, `EHLO ${smtpDomain()}`, [250], "EHLO");

    if (!config.secure) {
      await command(socket, reader, "STARTTLS", [220], "STARTTLS");
      reader.dispose();
      socket = tls.connect({
        socket,
        servername: config.host,
        timeout: timeoutMs,
      });
      reader = createLineReader(socket, timeoutMs);
      await command(socket, reader, `EHLO ${smtpDomain()}`, [250], "EHLO");
    }

    if (config.username && config.password) {
      await command(socket, reader, "AUTH LOGIN", [334], "AUTH LOGIN");
      await command(
        socket,
        reader,
        Buffer.from(config.username, "utf8").toString("base64"),
        [334],
        "SMTP username"
      );
      await command(
        socket,
        reader,
        Buffer.from(config.password, "utf8").toString("base64"),
        [235],
        "SMTP password"
      );
    }

    await command(
      socket,
      reader,
      `MAIL FROM:<${extractEmail(config.fromEmail)}>`,
      [250],
      "MAIL FROM"
    );
    await command(
      socket,
      reader,
      `RCPT TO:<${extractEmail(message.to)}>`,
      [250, 251],
      "RCPT TO"
    );
    await command(socket, reader, "DATA", [354], "DATA");
    socket.write(`${dotStuff(buildMimeMessage(config, message))}\r\n.\r\n`);
    await expect(reader.readResponse(), [250], "message body");
    await command(socket, reader, "QUIT", [221], "QUIT");
  } finally {
    reader.dispose();
    socket.end();
  }
}

async function command(
  socket: net.Socket,
  reader: LineReader,
  line: string,
  expected: number[],
  label: string
) {
  socket.write(`${line}\r\n`);
  await expect(reader.readResponse(), expected, label);
}

async function expect(
  responsePromise: Promise<SmtpResponse>,
  expected: number[],
  label: string
) {
  const response = await responsePromise;
  if (!expected.includes(response.code)) {
    throw new Error(
      `SMTP ${label} failed (${response.code}): ${response.lines.join(" ")}`
    );
  }
}

function createLineReader(
  socket: net.Socket,
  timeoutMs: number
): LineReader {
  let buffer = "";
  let current: string[] = [];
  const responses: SmtpResponse[] = [];
  const waiters: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  function flush() {
    while (responses.length && waiters.length) {
      const waiter = waiters.shift();
      const response = responses.shift();
      if (!waiter || !response) return;
      clearTimeout(waiter.timer);
      waiter.resolve(response);
    }
  }

  function rejectAll(error: Error) {
    while (waiters.length) {
      const waiter = waiters.shift();
      if (!waiter) continue;
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  function onData(chunk: Buffer) {
    buffer += chunk.toString("utf8");
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const rawLine = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      current.push(rawLine);

      const match = /^(\d{3})([\s-])/.exec(rawLine);
      if (match?.[2] === " ") {
        responses.push({
          code: Number(match[1]),
          lines: current,
        });
        current = [];
        flush();
      }
      index = buffer.indexOf("\n");
    }
  }

  function onError(error: Error) {
    rejectAll(error);
  }

  function onClose() {
    rejectAll(new Error("SMTP connection closed before a response was read."));
  }

  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  return {
    readResponse() {
      if (responses.length) {
        return Promise.resolve(responses.shift() as SmtpResponse);
      }
      return new Promise<SmtpResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("SMTP response timed out."));
        }, timeoutMs);
        waiters.push({ resolve, reject, timer });
      });
    },
    dispose() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      rejectAll(new Error("SMTP reader disposed."));
    },
  };
}

function buildMimeMessage(
  config: SmtpEmailConfig,
  message: SmtpEmailMessage
) {
  const headers = [
    `From: ${formatAddress(config.fromEmail, config.fromName)}`,
    `To: ${formatAddress(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@${smtpDomain()}>`,
    "MIME-Version: 1.0",
  ];

  if (message.replyTo) {
    headers.push(`Reply-To: ${formatAddress(message.replyTo)}`);
  }

  if (!message.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeNewlines(message.text),
    ].join("\r\n");
  }

  const boundary = `mylanding-${randomBytes(12).toString("hex")}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeNewlines(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeNewlines(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function dotStuff(message: string) {
  return normalizeNewlines(message).replace(/^\./gm, "..");
}

function normalizeNewlines(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function formatAddress(email: string, name?: string | null) {
  const cleanEmail = extractEmail(email);
  const cleanName = sanitizeHeader(name ?? "");
  if (!cleanName) return cleanEmail;
  if (/^[\x20-\x7E]*$/.test(cleanName)) {
    return `"${cleanName.replace(/["\\]/g, "\\$&")}" <${cleanEmail}>`;
  }
  return `${encodeHeader(cleanName)} <${cleanEmail}>`;
}

function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function extractEmail(value: string) {
  const clean = sanitizeHeader(value);
  const match = /<([^>]+)>/.exec(clean);
  return (match?.[1] ?? clean).trim();
}

function smtpDomain() {
  const fromEnv =
    process.env.APP_NOTIFICATION_EMAIL_FROM ||
    process.env.NEXT_PUBLIC_SITE_DOMAIN ||
    process.env.NEXTAUTH_URL ||
    "landing.my.id";

  try {
    return new URL(fromEnv).hostname || "landing.my.id";
  } catch {
    return fromEnv.replace(/^.*@/, "") || "landing.my.id";
  }
}
