import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: what makes an address "already known" is a comparison against
// rows, and the first-saved-is-default rule only shows up against the table.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  addressFingerprint,
  isCompleteAddress,
  listCustomerAddresses,
  rememberCustomerAddress,
} from "@/lib/customer-addresses";

let workspaceId = "";
let ownerId = "";
let customerId = "";

const jakarta = {
  recipientName: "Budi Santoso",
  recipientPhone: "081234567890",
  provinceId: "6",
  provinceName: "DKI Jakarta",
  cityId: "152",
  cityName: "Jakarta Selatan",
  postalCode: "12140",
  address: "Jl. Merdeka No. 1",
};

beforeAll(async () => {
  const tag = `addr-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
  const customer = await prisma.customer.create({
    data: { workspaceId, name: "Budi", email: `${tag}-budi@buildery.test` },
  });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("isCompleteAddress", () => {
  it("needs a recipient, a phone, a street and somewhere to send it", () => {
    expect(isCompleteAddress(jakarta)).toBe(true);
    expect(isCompleteAddress({ ...jakarta, address: "   " })).toBe(false);
    expect(isCompleteAddress({ ...jakarta, recipientPhone: "" })).toBe(false);
    expect(isCompleteAddress({ ...jakarta, cityId: null, cityName: null })).toBe(false);
  });

  it("accepts a city name when there is no city id", () => {
    expect(isCompleteAddress({ ...jakarta, cityId: null })).toBe(true);
  });
});

describe("addressFingerprint", () => {
  it("ignores casing and stray whitespace", () => {
    expect(addressFingerprint(jakarta)).toBe(
      addressFingerprint({
        ...jakarta,
        recipientName: "  budi   santoso ",
        address: "JL. MERDEKA NO. 1",
      })
    );
  });

  it("tells two different addresses apart", () => {
    expect(addressFingerprint(jakarta)).not.toBe(
      addressFingerprint({ ...jakarta, address: "Jl. Merdeka No. 2" })
    );
  });
});

describe("rememberCustomerAddress", () => {
  it("saves the first address and makes it the default", async () => {
    const result = await rememberCustomerAddress(prisma, {
      workspaceId,
      customerId,
      ...jakarta,
    });
    expect(result).toBe("saved");

    const saved = await listCustomerAddresses(customerId);
    expect(saved).toHaveLength(1);
    expect(saved[0].isDefault).toBe(true);
    expect(saved[0].cityName).toBe("Jakarta Selatan");
  });

  it("does not grow the book when the same address comes back", async () => {
    const result = await rememberCustomerAddress(prisma, {
      workspaceId,
      customerId,
      ...jakarta,
      recipientName: "  BUDI santoso  ",
    });
    expect(result).toBe("known");
    expect(await listCustomerAddresses(customerId)).toHaveLength(1);
  });

  it("adds a genuinely different address without stealing the default", async () => {
    const result = await rememberCustomerAddress(prisma, {
      workspaceId,
      customerId,
      ...jakarta,
      address: "Jl. Asia Afrika No. 8",
      cityId: "23",
      cityName: "Bandung",
    });
    expect(result).toBe("saved");

    const saved = await listCustomerAddresses(customerId);
    expect(saved).toHaveLength(2);
    expect(saved.filter((entry) => entry.isDefault)).toHaveLength(1);
    // The default is offered first.
    expect(saved[0].cityName).toBe("Jakarta Selatan");
  });

  it("keeps nothing from a half-filled checkout", async () => {
    const before = await listCustomerAddresses(customerId);
    const result = await rememberCustomerAddress(prisma, {
      workspaceId,
      customerId,
      ...jakarta,
      address: null,
    });
    expect(result).toBe("skipped");
    expect(await listCustomerAddresses(customerId)).toHaveLength(before.length);
  });

  it("never throws, so a checkout cannot fail on the address book", async () => {
    await expect(
      rememberCustomerAddress(prisma, {
        workspaceId,
        customerId: "customer-that-does-not-exist",
        ...jakarta,
      })
    ).resolves.toBe("skipped");
  });
});
