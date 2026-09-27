import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  settingUpdate: vi.fn(),
  methodCreate: vi.fn(),
  methodUpdateMany: vi.fn(),
  methodDeleteMany: vi.fn(),
  methodFindFirst: vi.fn(),
}));

const deps = vi.hoisted(() => ({
  auth: vi.fn(),
  getCurrentWorkspace: vi.fn(),
  getOrCreateEcommerceSetting: vi.fn(),
  rateLimitShared: vi.fn(),
  recordSettingsAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: deps.auth }));
vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: deps.getCurrentWorkspace,
}));
vi.mock("@/lib/ecommerce-settings", () => ({
  getOrCreateEcommerceSetting: deps.getOrCreateEcommerceSetting,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitShared: deps.rateLimitShared }));
vi.mock("@/lib/settings-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings-audit")>()),
  recordSettingsAudit: deps.recordSettingsAudit,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecommerceSetting: { update: db.settingUpdate },
    manualPaymentMethod: {
      create: db.methodCreate,
      updateMany: db.methodUpdateMany,
      deleteMany: db.methodDeleteMany,
      findFirst: db.methodFindFirst,
    },
  },
}));

import {
  createManualPaymentMethodAction,
  deleteManualPaymentMethodAction,
  updateEcommerceSettingsAction,
} from "@/lib/actions/ecommerce-settings";

const SETTING = {
  id: "set_1",
  updatedAt: new Date("2026-09-19T10:00:00Z"),
  midtransEnabled: false,
  midtransIsProduction: false,
  currencyCode: "IDR",
};

function signedInAs(role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER") {
  deps.auth.mockResolvedValue({ user: { id: "user_1" } });
  deps.getCurrentWorkspace.mockResolvedValue({
    workspace: { id: "ws_1" },
    role,
  });
}

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.rateLimitShared.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 9 });
  deps.getOrCreateEcommerceSetting.mockResolvedValue(SETTING);
  deps.recordSettingsAudit.mockResolvedValue(undefined);
  db.settingUpdate.mockResolvedValue({});
  db.methodCreate.mockResolvedValue({ id: "pm_1" });
  db.methodUpdateMany.mockResolvedValue({ count: 1 });
  db.methodDeleteMany.mockResolvedValue({ count: 1 });
  db.methodFindFirst.mockResolvedValue({
    id: "pm_1",
    name: "BCA",
    type: "BANK_TRANSFER",
    accountNumber: "111",
  });
});

describe("payment credentials", () => {
  it("refuses an Editor changing the Midtrans server key", async () => {
    // Peran Editor dijelaskan ke pengguna sebagai "tanpa akses billing", tapi
    // dulu Editor tetap bisa mengganti kunci gateway pembayaran.
    signedInAs("EDITOR");

    const res = await updateEcommerceSettingsAction(
      form({ section: "payments", midtransServerKey: "SB-Mid-server-EVIL" })
    );

    expect(res.ok).toBe(false);
    expect(db.settingUpdate).not.toHaveBeenCalled();
  });

  it("refuses an Editor switching Midtrans to production", async () => {
    signedInAs("EDITOR");

    const res = await updateEcommerceSettingsAction(
      form({ section: "payments", midtransIsProduction: "true" })
    );

    expect(res.ok).toBe(false);
    expect(db.settingUpdate).not.toHaveBeenCalled();
  });

  it("lets an Admin change the same fields", async () => {
    signedInAs("ADMIN");

    const res = await updateEcommerceSettingsAction(
      form({ section: "payments", midtransServerKey: "SB-Mid-server-OK" })
    );

    expect(res.ok).toBe(true);
    expect(db.settingUpdate).toHaveBeenCalledOnce();
  });

  it("still lets an Editor change non-money store settings", async () => {
    // Pemisahannya per-field, bukan per-tab: pekerjaan Editor yang sah tetap
    // jalan.
    signedInAs("EDITOR");

    const res = await updateEcommerceSettingsAction(
      form({ section: "general", currencyCode: "IDR", currencySymbolPosition: "LEFT" })
    );

    expect(res.ok).toBe(true);
    expect(db.settingUpdate).toHaveBeenCalledOnce();
  });
});

describe("payment destinations", () => {
  it("refuses an Editor adding a bank account", async () => {
    // Ini rekening yang dilihat pembeli saat checkout.
    signedInAs("EDITOR");

    const res = await createManualPaymentMethodAction(
      form({ name: "Rekening pribadi", type: "BANK_TRANSFER", accountNumber: "999" })
    );

    expect(res.ok).toBe(false);
    expect(db.methodCreate).not.toHaveBeenCalled();
  });

  it("refuses an Editor deleting one", async () => {
    signedInAs("EDITOR");

    const res = await deleteManualPaymentMethodAction("pm_1");

    expect(res.ok).toBe(false);
    expect(db.methodDeleteMany).not.toHaveBeenCalled();
  });

  it("lets an Owner add one, and records it", async () => {
    signedInAs("OWNER");

    const res = await createManualPaymentMethodAction(
      form({ name: "BCA Toko", type: "BANK_TRANSFER", accountNumber: "123" })
    );

    expect(res.ok).toBe(true);
    expect(db.methodCreate).toHaveBeenCalledOnce();
    expect(deps.recordSettingsAudit).toHaveBeenCalledOnce();
  });

  it("rejects an unknown payment method type", async () => {
    signedInAs("OWNER");

    const res = await createManualPaymentMethodAction(
      form({ name: "Aneh", type: "CRYPTO" })
    );

    expect(res.ok).toBe(false);
    expect(db.methodCreate).not.toHaveBeenCalled();
  });
});

describe("settings write hygiene", () => {
  it("rejects an unknown section instead of silently saving nothing", async () => {
    signedInAs("ADMIN");

    const res = await updateEcommerceSettingsAction(form({ section: "payment" }));

    expect(res.ok).toBe(false);
    expect(db.settingUpdate).not.toHaveBeenCalled();
  });

  it("rejects a save that started before someone else's change", async () => {
    signedInAs("ADMIN");

    const res = await updateEcommerceSettingsAction(
      form({
        section: "general",
        currencyCode: "USD",
        currencySymbolPosition: "LEFT",
        __loadedAt: new Date("2026-09-19T09:00:00Z").toISOString(),
      })
    );

    expect(res.ok).toBe(false);
    expect(db.settingUpdate).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    signedInAs("ADMIN");
    deps.rateLimitShared.mockResolvedValue({ ok: false, retryAfter: 60, remaining: 0 });

    const res = await updateEcommerceSettingsAction(
      form({ section: "general", currencyCode: "IDR" })
    );

    expect(res.ok).toBe(false);
    expect(db.settingUpdate).not.toHaveBeenCalled();
  });

  it("records an audit entry naming the changed fields", async () => {
    signedInAs("ADMIN");

    await updateEcommerceSettingsAction(
      form({ section: "general", currencyCode: "USD", currencySymbolPosition: "LEFT" })
    );

    expect(deps.recordSettingsAudit).toHaveBeenCalledOnce();
    const call = deps.recordSettingsAudit.mock.calls[0][1];
    expect(call.action).toBe("settings.ecommerce.general");
    expect(call.changedFields).toContain("currencyCode");
  });

  it("refuses a viewer outright", async () => {
    signedInAs("VIEWER");

    const res = await updateEcommerceSettingsAction(
      form({ section: "general", currencyCode: "IDR" })
    );

    expect(res.ok).toBe(false);
  });
});
