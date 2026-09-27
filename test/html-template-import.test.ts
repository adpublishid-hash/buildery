import { describe, expect, it, vi } from "vitest";

import { importHtmlTemplateBundle } from "@/lib/html-template-import";

function file(path: string, content: string, type = "text/plain") {
  const blob = new File([content], path.split("/").pop() ?? path, { type });
  Object.defineProperty(blob, "webkitRelativePath", {
    value: path,
    configurable: true,
  });
  return blob;
}

describe("importHtmlTemplateBundle", () => {
  it("inlines stylesheet links and rewrites relative assets", async () => {
    const result = await importHtmlTemplateBundle([
      file(
        "template/index.html",
        '<html><head><link rel="stylesheet" href="css/app.css"></head><body><img src="images/logo.svg"></body></html>',
        "text/html"
      ),
      file(
        "template/css/app.css",
        '.hero{background:url("../images/bg.svg")}',
        "text/css"
      ),
      file(
        "template/images/logo.svg",
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        "image/svg+xml"
      ),
      file(
        "template/images/bg.svg",
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        "image/svg+xml"
      ),
    ]);

    expect(result.html).toContain("<style");
    expect(result.html).not.toContain('<link rel="stylesheet"');
    expect(result.html).toContain("src=\"data:image/svg+xml;base64,");
    expect(result.html).toContain('url("data:image/svg+xml;base64,');
    expect(result.resolvedAssetCount).toBe(3);
  });

  it("uses uploaded image URLs and caches repeated references", async () => {
    const uploadAsset = vi.fn(async () => "/uploads/workspace/logo.png");
    const result = await importHtmlTemplateBundle(
      [
        file(
          "site/index.html",
          '<body><img src="assets/logo.png"><img src="/assets/logo.png"></body>',
          "text/html"
        ),
        file("site/assets/logo.png", "png", "image/png"),
      ],
      { uploadAsset }
    );

    expect(result.html).toContain('src="/uploads/workspace/logo.png"');
    expect(uploadAsset).toHaveBeenCalledTimes(1);
    expect(result.resolvedAssetCount).toBe(1);
  });

  it("imports a stored ZIP template", async () => {
    const zip = storedZipFile("template.zip", [
      {
        path: "template/index.html",
        content: '<body><img src="assets/logo.svg"></body>',
      },
      {
        path: "template/assets/logo.svg",
        content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      },
    ]);

    const result = await importHtmlTemplateBundle([zip]);

    expect(result.label).toBe("index");
    expect(result.html).toContain("src=\"data:image/svg+xml;base64,");
    expect(result.assetCount).toBe(1);
    expect(result.resolvedAssetCount).toBe(1);
  });
});

function storedZipFile(
  name: string,
  entries: Array<{ path: string; content: string }>
) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    const local = new Uint8Array(30 + fileName.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, fileName.length, true);
    local.set(fileName, 30);
    local.set(data, 30 + fileName.length);
    chunks.push(local);

    const central = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint32(42, offset, true);
    central.set(fileName, 46);
    centralChunks.push(central);

    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);

  return new File([...chunks, ...centralChunks, eocd].map(toArrayBuffer), name, {
    type: "application/zip",
  });
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
