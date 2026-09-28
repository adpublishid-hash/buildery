import { loadWebchat, WEBCHAT_MAX_LENGTH, webchatSettings } from "@/lib/integrations/inbox/webchat";

export const dynamic = "force-dynamic";

type Params = { params: { key: string } };

/**
 * The embeddable chat bubble. One script tag, no dependencies; it renders in
 * a shadow root so the store's CSS cannot break it (or be broken by it), and
 * every message is inserted as text, never HTML.
 */
export async function GET(_req: Request, { params }: Params) {
  const connection = await loadWebchat(params.key);
  const headers = {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  };
  if (!connection) return new Response("/* web chat is offline */", { status: 200, headers });

  const settings = { ...webchatSettings(connection.config), key: params.key, maxLength: WEBCHAT_MAX_LENGTH };
  return new Response(widgetSource(JSON.stringify(settings)), { headers });
}

function widgetSource(settingsJson: string) {
  return `(() => {
  if (window.__kvWebchat) return;
  window.__kvWebchat = true;
  const S = ${settingsJson};
  const script = document.currentScript;
  const base = script && script.src ? new URL(script.src).origin : location.origin;
  const api = base + "/api/integrations/webchat/" + encodeURIComponent(S.key) + "/messages";
  const store = {
    get(k) { try { return localStorage.getItem("kvwc:" + S.key + ":" + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("kvwc:" + S.key + ":" + k, v); } catch (e) {} },
  };
  function randomId(n) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[b & 63]).join("");
  }
  let token = store.get("token");
  if (!token || !/^[A-Za-z0-9_-]{24,80}$/.test(token)) { token = randomId(32); store.set("token", token); }

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:20px;" + (S.position === "left" ? "left" : "right") + ":20px;z-index:2147483000;";
  const root = host.attachShadow({ mode: "open" });
  const side = S.position === "left" ? "left" : "right";
  root.innerHTML = \`<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .launch { width: 56px; height: 56px; border-radius: 999px; border: 0; cursor: pointer; background: \${S.accentColor}; color: #fff;
      display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(0,0,0,.18); position: relative; transition: transform .15s; }
    .launch:hover { transform: scale(1.05); }
    .launch:focus-visible, button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid \${S.accentColor}; outline-offset: 2px; }
    .dot { position: absolute; top: 4px; right: 4px; width: 12px; height: 12px; border-radius: 999px; background: #ef4444; border: 2px solid #fff; display: none; }
    .panel { position: absolute; bottom: 68px; \${side}: 0; width: 360px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 110px);
      background: #fff; color: #111827; border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,.2); display: none; flex-direction: column; overflow: hidden; border: 1px solid rgba(0,0,0,.08); }
    .panel.open { display: flex; }
    header { background: \${S.accentColor}; color: #fff; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    header strong { font-size: 15px; display: block; }
    header span { font-size: 12px; opacity: .85; }
    .x { background: transparent; border: 0; color: #fff; cursor: pointer; font-size: 20px; line-height: 1; padding: 4px 8px; border-radius: 8px; }
    .x:hover { background: rgba(255,255,255,.15); }
    .list { flex: 1; overflow-y: auto; padding: 14px; background: #f9fafb; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 82%; padding: 8px 12px; border-radius: 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
    .agent { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
    .visitor { align-self: flex-end; background: \${S.accentColor}; color: #fff; border-bottom-right-radius: 4px; }
    .pending { opacity: .6; }
    .who { display: flex; gap: 6px; padding: 10px 12px 0; }
    .who input { flex: 1; min-width: 0; height: 34px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 10px; font-size: 13px; color: #111827; background: #fff; }
    form { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid #f3f4f6; align-items: flex-end; }
    textarea { flex: 1; resize: none; border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 10px; font-size: 14px; max-height: 110px; min-height: 40px; color: #111827; background: #fff; }
    .send { height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: \${S.accentColor}; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .send:disabled { opacity: .5; cursor: default; }
    .err { color: #b91c1c; font-size: 12px; padding: 0 14px 8px; display: none; }
    @media (max-width: 480px) { .panel { width: calc(100vw - 24px); height: calc(100vh - 100px); } }
  </style>
  <div class="panel" role="dialog" aria-label="Chat">
    <header><div><strong>Chat</strong><span>Kami siap membantu</span></div><button class="x" type="button" aria-label="Tutup chat">&times;</button></header>
    <div class="list" aria-live="polite"></div>
    <div class="who"><input class="name" placeholder="Nama (opsional)" maxlength="80" autocomplete="name"><input class="email" type="email" placeholder="Email (opsional)" maxlength="200" autocomplete="email"></div>
    <div class="err" role="alert"></div>
    <form><textarea rows="1" placeholder="Tulis pesan…" aria-label="Pesan" maxlength="\${S.maxLength}"></textarea><button class="send" type="submit">Kirim</button></form>
  </div>
  <button class="launch" type="button" aria-label="Buka chat"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="dot"></span></button>\`;
  document.body.appendChild(host);

  const $ = (sel) => root.querySelector(sel);
  const panel = $(".panel"), list = $(".list"), launch = $(".launch"), dot = $(".dot");
  const form = $("form"), input = $("textarea"), send = $(".send"), err = $(".err");
  const who = $(".who"), nameInput = $(".name"), emailInput = $(".email");
  nameInput.value = store.get("name") || "";
  emailInput.value = store.get("email") || "";

  const seen = new Set();
  let last = null, open = false, timer = null, count = 0;

  function bubble(text, from, extra) {
    const el = document.createElement("div");
    el.className = "msg " + from + (extra ? " " + extra : "");
    el.textContent = text;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
  }
  bubble(S.greeting, "agent");

  async function poll() {
    try {
      const url = api + "?v=" + encodeURIComponent(token) + (last ? "&after=" + encodeURIComponent(last) : "");
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      let fresh = false;
      for (const m of data.messages || []) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        last = m.at;
        list.querySelectorAll(".pending").forEach((p) => { if (m.from === "visitor" && p.textContent === m.body) p.remove(); });
        bubble(m.body, m.from);
        count++;
        if (m.from === "agent") fresh = true;
      }
      who.style.display = count > 0 ? "none" : "flex";
      if (fresh && !open) { dot.style.display = "block"; store.set("unread", "1"); }
    } catch (e) {}
  }
  function schedule() {
    clearTimeout(timer);
    // Quick while the conversation is on screen, slow in the background.
    timer = setTimeout(async () => { await poll(); schedule(); }, open ? 4000 : 30000);
  }
  function toggle(next) {
    open = next;
    panel.classList.toggle("open", open);
    launch.setAttribute("aria-label", open ? "Tutup chat" : "Buka chat");
    if (open) { dot.style.display = "none"; store.set("unread", ""); poll(); setTimeout(() => input.focus(), 50); }
    schedule();
  }
  launch.addEventListener("click", () => toggle(!open));
  $(".x").addEventListener("click", () => toggle(false));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    err.style.display = "none";
    send.disabled = true;
    const pending = bubble(text, "visitor", "pending");
    input.value = ""; input.style.height = "auto";
    store.set("name", nameInput.value.trim()); store.set("email", emailInput.value.trim());
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: token, id: randomId(16), text, name: nameInput.value.trim(), email: emailInput.value.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Pesan gagal terkirim.");
      }
      await poll();
    } catch (error) {
      pending.remove();
      input.value = text;
      err.textContent = error.message || "Pesan gagal terkirim.";
      err.style.display = "block";
    } finally {
      send.disabled = false;
    }
  });
  if (store.get("unread")) dot.style.display = "block";
  poll().then(schedule);
})();
`;
}
