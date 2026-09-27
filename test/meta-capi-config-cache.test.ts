import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationSetting: {
      findUnique: db.findUnique,
    },
  },
}));

import {
  clearMetaCapiConfigCache,
  getMetaCapiConfig,
} from "@/lib/meta-capi";

describe("Meta CAPI config cache", () => {
  afterEach(() => {
    clearMetaCapiConfigCache();
    db.findUnique.mockReset();
    vi.useRealTimers();
  });

  it("caches enabled config across calls", async () => {
    db.findUnique.mockResolvedValue({
      metaPixelId: "pixel_1",
      metaCapiEnabled: true,
      metaCapiAccessToken: "token_1",
      metaCapiTestEventCode: null,
    });

    const first = await getMetaCapiConfig("workspace_1");
    const second = await getMetaCapiConfig("workspace_1");

    expect(first).toEqual({
      pixelId: "pixel_1",
      accessToken: "token_1",
      testEventCode: null,
    });
    expect(second).toEqual(first);
    expect(db.findUnique).toHaveBeenCalledTimes(1);
  });

  it("expires cached config after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    db.findUnique
      .mockResolvedValueOnce({
        metaPixelId: "pixel_1",
        metaCapiEnabled: true,
        metaCapiAccessToken: "token_1",
        metaCapiTestEventCode: null,
      })
      .mockResolvedValueOnce({
        metaPixelId: "pixel_2",
        metaCapiEnabled: true,
        metaCapiAccessToken: "token_2",
        metaCapiTestEventCode: "TEST",
      });

    expect(await getMetaCapiConfig("workspace_1")).toMatchObject({
      pixelId: "pixel_1",
    });
    vi.advanceTimersByTime(29_999);
    expect(await getMetaCapiConfig("workspace_1")).toMatchObject({
      pixelId: "pixel_1",
    });
    vi.advanceTimersByTime(2);
    expect(await getMetaCapiConfig("workspace_1")).toMatchObject({
      pixelId: "pixel_2",
      testEventCode: "TEST",
    });
    expect(db.findUnique).toHaveBeenCalledTimes(2);
  });

  it("can clear one workspace after integration settings change", async () => {
    db.findUnique
      .mockResolvedValueOnce({
        metaPixelId: "pixel_1",
        metaCapiEnabled: true,
        metaCapiAccessToken: "token_1",
        metaCapiTestEventCode: null,
      })
      .mockResolvedValueOnce({
        metaPixelId: "pixel_2",
        metaCapiEnabled: true,
        metaCapiAccessToken: "token_2",
        metaCapiTestEventCode: null,
      });

    expect(await getMetaCapiConfig("workspace_1")).toMatchObject({
      pixelId: "pixel_1",
    });
    clearMetaCapiConfigCache("workspace_1");
    expect(await getMetaCapiConfig("workspace_1")).toMatchObject({
      pixelId: "pixel_2",
    });
    expect(db.findUnique).toHaveBeenCalledTimes(2);
  });
});
