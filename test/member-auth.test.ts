import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
const customerFindUnique = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: () => new Map(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findUnique: customerFindUnique,
      findUniqueOrThrow: customerFindUnique,
    },
  },
}));

const COOKIE = "bd_member_session";

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "cust_1",
    workspaceId: "ws_1",
    name: "Budi",
    email: "budi@contoh.id",
    phone: null,
    sessionVersion: 0,
    workspace: { slug: "acme" },
    ...overrides,
  };
}

async function load() {
  return import("@/lib/member-auth");
}

describe("member sessions", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    jar.clear();
    customerFindUnique.mockReset();
    customerFindUnique.mockResolvedValue(customer());
    process.env.NEXTAUTH_SECRET = "test-secret-for-member-sessions";
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.useRealTimers();
  });

  it("round-trips a session through the cookie", async () => {
    const { getMemberSession, setMemberSession } = await load();

    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    const session = await getMemberSession("acme");

    expect(session).toMatchObject({
      workspaceId: "ws_1",
      workspaceSlug: "acme",
      customerId: "cust_1",
      email: "budi@contoh.id",
    });
  });

  it("returns null without a cookie", async () => {
    const { getMemberSession } = await load();
    expect(await getMemberSession()).toBeNull();
  });

  it("rejects a cookie whose payload was edited", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    customerFindUnique.mockClear();

    const [, signature] = jar.get(COOKIE)!.split(".");
    const forged = Buffer.from(
      JSON.stringify({ workspaceId: "ws_1", customerId: "cust_admin", exp: 9_999_999_999 })
    ).toString("base64url");
    jar.set(COOKIE, `${forged}.${signature}`);

    expect(await getMemberSession()).toBeNull();
    expect(customerFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const first = await load();
    await first.setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });

    vi.resetModules();
    process.env.NEXTAUTH_SECRET = "a-different-deployment-secret";
    const second = await load();

    expect(await second.getMemberSession()).toBeNull();
  });

  it("rejects garbage cookie values without throwing", async () => {
    const { getMemberSession } = await load();
    for (const value of ["", "nodot", ".", "a.b", "%%%.###"]) {
      jar.set(COOKIE, value);
      expect(await getMemberSession(), value).toBeNull();
    }
  });

  it("rejects an expired session", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);

    expect(await getMemberSession()).toBeNull();
  });

  it("does not let a session for one store open another store", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });

    expect(await getMemberSession("other-store")).toBeNull();
  });

  it("rejects a session whose customer moved to another workspace", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    customerFindUnique.mockResolvedValue(customer({ workspaceId: "ws_2" }));

    expect(await getMemberSession()).toBeNull();
  });

  it("rejects a session for a customer that no longer exists", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    customerFindUnique.mockResolvedValue(null);

    expect(await getMemberSession()).toBeNull();
  });

  it("rejects a session after its version is revoked", async () => {
    const { getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    customerFindUnique.mockResolvedValue(customer({ sessionVersion: 1 }));
    expect(await getMemberSession()).toBeNull();
  });

  it("clears the session", async () => {
    const { clearMemberSession, getMemberSession, setMemberSession } = await load();
    await setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" });
    clearMemberSession();

    expect(await getMemberSession()).toBeNull();
  });

  it("refuses to sign sessions in production without a real secret", async () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { setMemberSession } = await load();

    // The development fallback is public knowledge; production must not use it.
    await expect(
      setMemberSession({ workspaceId: "ws_1", customerId: "cust_1" })
    ).rejects.toThrow("NEXTAUTH_SECRET is required in production.");
  });
});
