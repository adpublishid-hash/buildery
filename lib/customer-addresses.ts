import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The shipping addresses a customer can pick from next time.
 *
 * Checkout only ever snapshotted the address onto the order, so a returning
 * buyer retyped the whole thing. Saving it is a side effect of checking out —
 * nobody fills in an address book on purpose.
 */

type Tx = Prisma.TransactionClient | PrismaClient;

export type AddressInput = {
  recipientName: string | null;
  recipientPhone: string | null;
  provinceId: string | null;
  provinceName: string | null;
  cityId: string | null;
  cityName: string | null;
  postalCode: string | null;
  address: string | null;
};

/** Everything that has to be present before an address is worth keeping. */
export function isCompleteAddress(input: AddressInput) {
  return Boolean(
    input.recipientName?.trim() &&
      input.recipientPhone?.trim() &&
      input.address?.trim() &&
      (input.cityId?.trim() || input.cityName?.trim())
  );
}

/**
 * Same address, ignoring how it was typed. Without this, one letter of extra
 * whitespace would grow the book by a row on every order.
 */
export function addressFingerprint(
  input: Pick<
    AddressInput,
    "recipientName" | "recipientPhone" | "address" | "cityId" | "cityName" | "postalCode"
  >
) {
  return [
    input.recipientName,
    input.recipientPhone,
    input.address,
    input.cityId || input.cityName,
    input.postalCode,
  ]
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export async function listCustomerAddresses(customerId: string) {
  return prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });
}

/**
 * Records the address an order shipped to, unless the customer already has it.
 *
 * Never throws: a checkout must not fail because the address book could not be
 * written.
 */
export async function rememberCustomerAddress(
  tx: Tx,
  input: AddressInput & { workspaceId: string; customerId: string }
): Promise<"saved" | "known" | "skipped"> {
  if (!isCompleteAddress(input)) return "skipped";

  try {
    const existing = await tx.customerAddress.findMany({
      where: { customerId: input.customerId },
      select: {
        id: true,
        recipientName: true,
        recipientPhone: true,
        address: true,
        cityId: true,
        cityName: true,
        postalCode: true,
      },
    });

    const fingerprint = addressFingerprint(input);
    const match = existing.find(
      (candidate) => addressFingerprint(candidate) === fingerprint
    );
    if (match) {
      await tx.customerAddress.update({
        where: { id: match.id },
        data: { updatedAt: new Date() },
      });
      return "known";
    }

    await tx.customerAddress.create({
      data: {
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        recipientName: input.recipientName!.trim(),
        recipientPhone: input.recipientPhone!.trim(),
        provinceId: input.provinceId,
        provinceName: input.provinceName,
        cityId: input.cityId,
        cityName: input.cityName,
        postalCode: input.postalCode,
        address: input.address!.trim(),
        // The first one saved is the one offered first next time.
        isDefault: existing.length === 0,
      },
    });
    return "saved";
  } catch {
    return "skipped";
  }
}
