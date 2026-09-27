import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup }));

import {
  assertPublicHttpUrl,
  isPrivateAddress,
  parsePublicHttpUrl,
} from "@/lib/outbound-url";

describe("parsePublicHttpUrl", () => {
  it("accepts an ordinary https endpoint", () => {
    const result = parsePublicHttpUrl("https://hooks.example.com/inbound");
    expect(result.ok).toBe(true);
  });

  it("rejects a non-http scheme", () => {
    expect(parsePublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(parsePublicHttpUrl("gopher://example.com").ok).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(parsePublicHttpUrl("not a url").ok).toBe(false);
  });

  it("rejects credentials embedded in the URL", () => {
    expect(parsePublicHttpUrl("https://user:pass@example.com/x").ok).toBe(false);
  });

  it("rejects localhost by name", () => {
    expect(parsePublicHttpUrl("http://localhost:3000/x").ok).toBe(false);
    expect(parsePublicHttpUrl("http://app.localhost/x").ok).toBe(false);
  });

  it("rejects cloud metadata hostnames", () => {
    expect(parsePublicHttpUrl("http://metadata.google.internal/x").ok).toBe(false);
  });

  it("rejects private and loopback literals without a DNS lookup", () => {
    for (const host of [
      "http://127.0.0.1/x",
      "http://10.1.2.3/x",
      "http://172.16.0.1/x",
      "http://192.168.1.1/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/x",
      "http://[fd00::1]/x",
    ]) {
      expect(parsePublicHttpUrl(host).ok, host).toBe(false);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows a public IP literal", () => {
    expect(parsePublicHttpUrl("https://93.184.216.34/x").ok).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("resolves the host and accepts a public address", async () => {
    const result = await assertPublicHttpUrl("https://hooks.example.com/x");

    expect(result.ok).toBe(true);
    expect(lookup).toHaveBeenCalledWith("hooks.example.com", { all: true });
  });

  it("rejects a public hostname that resolves to a private address", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await assertPublicHttpUrl("https://rebind.example.com/x");

    expect(result.ok).toBe(false);
  });

  it("rejects when any address in a round-robin is private", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const result = await assertPublicHttpUrl("https://mixed.example.com/x");

    expect(result.ok).toBe(false);
  });

  it("rejects a host that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await assertPublicHttpUrl("https://nope.example.com/x");

    expect(result.ok).toBe(false);
  });

  it("rejects an empty resolution", async () => {
    lookup.mockResolvedValue([]);

    expect((await assertPublicHttpUrl("https://nope.example.com/x")).ok).toBe(false);
  });

  it("skips DNS for an address literal", async () => {
    const result = await assertPublicHttpUrl("https://93.184.216.34/x");

    expect(result.ok).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("isPrivateAddress", () => {
  it("classifies IPv4 ranges", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
    expect(isPrivateAddress("10.255.255.255")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("172.15.0.1")).toBe(false);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("224.0.0.1")).toBe(true);
  });

  it("classifies IPv6 ranges", () => {
    expect(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("ff02::1")).toBe(true);
  });

  it("treats an IPv4-mapped private address as private", () => {
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats anything that is not an address as unsafe", () => {
    expect(isPrivateAddress("example.com")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});
