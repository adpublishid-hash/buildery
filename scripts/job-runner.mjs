import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(join(dirname(dirname(fileURLToPath(import.meta.url))), ".env"));

function loadDotEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["'](.*)["']$/s, "$1");
  }
}

const PORT = process.env.PORT || "3011";
const TARGET =
  process.env.JOBS_RUNNER_URL || `http://127.0.0.1:${PORT}/api/jobs/run`;
const SECRET = process.env.JOBS_RUNNER_SECRET || "";
const TICK_MS = Number(process.env.JOBS_TICK_MS || 60_000);
const REQUEST_TIMEOUT_MS = Math.max(10_000, TICK_MS - 5_000);

if (!SECRET) {
  console.error(
    "[job-runner] JOBS_RUNNER_SECRET is not set. Generate one with: openssl rand -hex 32"
  );
  process.exit(1);
}

let running = false;
let consecutiveFailures = 0;

async function tick() {
  if (running) return;
  running = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });

    if (!res.ok) {
      consecutiveFailures += 1;
      const text = await res.text().catch(() => "");
      console.warn(
        `[job-runner] HTTP ${res.status} (${consecutiveFailures} in a row) ${text.slice(0, 200)}`
      );
      return;
    }

    consecutiveFailures = 0;
    const summary = await res.json();
    if (summary.claimed > 0 || summary.reclaimed > 0) {
      console.log(
        `[job-runner] claimed=${summary.claimed} done=${summary.done} ` +
          `retried=${summary.retried} failed=${summary.failed} ` +
          `reclaimed=${summary.reclaimed}`
      );
      for (const result of summary.results ?? []) {
        console.log(
          `[job-runner]   ${result.ok ? "ok " : "ERR"} ${result.kind} ${result.detail}`
        );
      }
    }
  } catch (error) {
    consecutiveFailures += 1;
    const reason = error?.name === "AbortError" ? "timed out" : error?.message;
    console.warn(
      `[job-runner] tick failed (${consecutiveFailures} in a row): ${reason}`
    );
  } finally {
    clearTimeout(timeout);
    running = false;
  }
}

const timer = setInterval(tick, TICK_MS);
setTimeout(tick, 10_000);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log(`[job-runner] ${signal} received; stopping.`);
    process.exit(0);
  });
}

console.log(
  `[job-runner] ticking ${TARGET} every ${Math.round(TICK_MS / 1000)}s`
);
