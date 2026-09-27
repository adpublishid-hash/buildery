import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    website: { findFirst: db.findFirst, create: db.create },
    workspace: { findUniqueOrThrow: db.workspace },
  },
}));

import { getOrCreateDefaultWebsite } from "@/lib/website";

const website = { id: "site1", workspaceId: "w1", slug: "toko" };

describe("getOrCreateDefaultWebsite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.workspace.mockResolvedValue({ id: "w1", name: "Toko", slug: "toko" });
  });

  it("returns the existing website without creating one", async () => {
    db.findFirst.mockResolvedValue(website);
    await expect(getOrCreateDefaultWebsite("w1")).resolves.toBe(website);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("creates the website on first use", async () => {
    db.findFirst.mockResolvedValue(null);
    db.create.mockResolvedValue(website);
    await expect(getOrCreateDefaultWebsite("w1")).resolves.toBe(website);
    expect(db.create.mock.calls[0][0].data).toMatchObject({ workspaceId: "w1", slug: "toko" });
  });

  it("returns the concurrent winner's website when it loses the create race", async () => {
    db.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(website);
    db.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.22.0",
      })
    );
    await expect(getOrCreateDefaultWebsite("w1")).resolves.toBe(website);
  });

  it("still throws errors that are not a lost race", async () => {
    db.findFirst.mockResolvedValue(null);
    db.create.mockRejectedValue(new Error("connection lost"));
    await expect(getOrCreateDefaultWebsite("w1")).rejects.toThrow("connection lost");
  });
});
