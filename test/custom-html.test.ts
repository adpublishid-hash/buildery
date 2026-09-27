import { describe, expect, it } from "vitest";

import {
  buildCustomHtmlDocument,
  isCustomHtmlHeightMessage,
  normalizeCustomHtmlBaseUrl,
} from "@/lib/blocks/custom-html";
import { pageBlocksSchema } from "@/lib/blocks/schema";

describe("custom HTML document", () => {
  it("wraps fragments without removing JavaScript", () => {
    const html = '<button onclick="this.textContent=\'Done\'">Run</button><script>window.ready=true</script>';
    const result = buildCustomHtmlDocument({ html, bridgeId: "block-1" });

    expect(result).toContain("<!doctype html>");
    expect(result).toContain('onclick="this.textContent=\'Done\'"');
    expect(result).toContain("<script>window.ready=true</script>");
    expect(result).toContain("buildery:custom-html-height");
  });

  it("keeps complete documents and inserts a safe base URL", () => {
    const result = buildCustomHtmlDocument({
      html: "<!doctype html><html><head><title>Demo</title></head><body><img src=\"image.png\"></body></html>",
      baseUrl: "https://cdn.example.com/site/",
      bridgeId: "block-2",
    });

    expect(result).toContain('<head><base href="https://cdn.example.com/site/">');
    expect(result.indexOf("buildery:custom-html-height")).toBeLessThan(
      result.toLowerCase().indexOf("</body>")
    );
  });

  it("does not mistake closing-body text inside user JavaScript for markup", () => {
    const source =
      '<html><head></head><body><script>window.sample="</body>"</script><p>Still here</p></body></html>';
    const result = buildCustomHtmlDocument({
      html: source,
      bridgeId: "block-3",
    });

    expect(result).toContain('<script>window.sample="</body>"</script>');
    expect(result).toContain("<p>Still here</p></body></html>");
  });

  it("rejects non-http base URLs", () => {
    expect(normalizeCustomHtmlBaseUrl("javascript:alert(1)")).toBe("");
    expect(normalizeCustomHtmlBaseUrl("/relative/path")).toBe("");
    expect(normalizeCustomHtmlBaseUrl(" https://example.com/assets/ ")).toBe(
      "https://example.com/assets/"
    );
  });

  it("validates height messages", () => {
    expect(
      isCustomHtmlHeightMessage({
        type: "buildery:custom-html-height",
        id: "block-1",
        height: 320,
      })
    ).toBe(true);
    expect(
      isCustomHtmlHeightMessage({
        type: "buildery:custom-html-height",
        id: "block-1",
        height: "320",
      })
    ).toBe(false);
  });
});

describe("custom HTML block schema", () => {
  it("accepts an imported HTML block and applies defaults", () => {
    const result = pageBlocksSchema.parse([
      {
        type: "CUSTOM_HTML",
        data: { html: "<script>document.body.dataset.ready='yes'</script>" },
      },
    ]);

    expect(result[0].type).toBe("CUSTOM_HTML");
    if (result[0].type === "CUSTOM_HTML") {
      expect(result[0].data.allowScripts).toBe(false);
      expect(result[0].data.allowForms).toBe(false);
      expect(result[0].data.allowPopups).toBe(false);
      expect(result[0].data.autoHeight).toBe(true);
      expect(result[0].data.height).toBe(500);
    }
  });
});
