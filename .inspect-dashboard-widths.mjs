import { writeFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9223";
const origin = "https://landing.my.id";
const sessionToken = process.env.DASHBOARD_SESSION_TOKEN;
if (!sessionToken) throw new Error("DASHBOARD_SESSION_TOKEN is required");
const target = await fetch(`${endpoint}/json/new?about:blank`, {
  method: "PUT",
}).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  handler(message);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, (message) => {
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text);
  }
  return response.result.value;
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Network.setCookie", {
  name: "__Secure-next-auth.session-token",
  value: sessionToken,
  domain: "landing.my.id",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax",
});

const routes = ["products", "customers", "inbox", "affiliate"];
const results = [];
for (const route of routes) {
  await navigate(`${origin}/dashboard/${route}`);
  const dimensions = await evaluate(`
    (() => {
      const root = document.documentElement;
      const body = document.body;
      return {
        route: location.pathname,
        title: document.title,
        innerWidth,
        rootClientWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
      };
    })()
  `);
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    `/tmp/buildery-${route}-mobile.png`,
    Buffer.from(screenshot.data, "base64")
  );
  results.push(dimensions);
}

console.log(JSON.stringify(results, null, 2));
socket.close();
