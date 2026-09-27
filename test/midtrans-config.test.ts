import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Midtrans credentials belong to the workspace, not the deployment: each store
 * settles into its own merchant account. The env vars stay as a fallback for
 * single-tenant installs and for workspaces that have not filled theirs in.
 */
describe("midtrans per-workspace configuration", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.MIDTRANS_SERVER_KEY = "env-server";
    process.env.MIDTRANS_CLIENT_KEY = "env-client";
    process.env.MIDTRANS_IS_PRODUCTION = "false";
  });

  afterEach(() => {
    process.env = { ...env };
  });

  async function load() {
    return import("@/lib/midtrans");
  }

  it("falls back to the deployment env when a workspace has no keys", async () => {
    const { resolveMidtransConfig } = await load();

    expect(resolveMidtransConfig(null)).toEqual({
      serverKey: "env-server",
      clientKey: "env-client",
      isProduction: false,
    });
  });

  it("prefers the workspace's own keys over the env", async () => {
    const { resolveMidtransConfig } = await load();

    expect(
      resolveMidtransConfig({
        enabled: true,
        serverKey: "ws-server",
        clientKey: "ws-client",
        isProduction: true,
      })
    ).toEqual({
      serverKey: "ws-server",
      clientKey: "ws-client",
      isProduction: true,
    });
  });

  it("treats a disabled workspace as having no credentials at all", async () => {
    const { isMidtransConfigured, resolveMidtransConfig } = await load();

    const disabled = { enabled: false, serverKey: "ws", clientKey: "ws" };
    expect(resolveMidtransConfig(disabled).serverKey).toBe("");
    // Even though the env has keys — switching Midtrans off must mean off.
    expect(isMidtransConfigured(disabled)).toBe(false);
  });

  it("fills only the half a workspace supplied, from the env", async () => {
    const { resolveMidtransConfig } = await load();

    expect(
      resolveMidtransConfig({ enabled: true, serverKey: "ws-server" })
    ).toEqual({
      serverKey: "ws-server",
      clientKey: "env-client",
      isProduction: false,
    });
  });

  it("ignores whitespace-only keys rather than sending them to Midtrans", async () => {
    const { resolveMidtransConfig } = await load();

    expect(
      resolveMidtransConfig({ enabled: true, serverKey: "   ", clientKey: "  " })
    ).toEqual({
      serverKey: "env-server",
      clientKey: "env-client",
      isProduction: false,
    });
  });

  it("reports unconfigured when neither workspace nor env has keys", async () => {
    process.env.MIDTRANS_SERVER_KEY = "";
    process.env.MIDTRANS_CLIENT_KEY = "";
    const { isMidtransConfigured } = await load();

    expect(isMidtransConfigured(null)).toBe(false);
    expect(isMidtransConfigured({ enabled: true, serverKey: "a", clientKey: "b" })).toBe(true);
  });

  it("lets a workspace run live while the deployment default is sandbox", async () => {
    const { resolveMidtransConfig } = await load();

    expect(resolveMidtransConfig({ isProduction: true }).isProduction).toBe(true);
    expect(resolveMidtransConfig(null).isProduction).toBe(false);
  });

  it("exposes the client key the browser should use for Snap", async () => {
    const { midtransClientKey } = await load();

    expect(midtransClientKey({ enabled: true, clientKey: "ws-client" })).toBe(
      "ws-client"
    );
    expect(midtransClientKey(null)).toBe("env-client");
  });
});
