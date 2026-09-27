import type { EcommerceSetting } from "@prisma/client";

import { formatPrice } from "@/lib/store";

/**
 * Cash on delivery.
 *
 * It is the one payment mode that is not a promise to pay now: the money
 * arrives with the courier. Two consequences run through the checkout — the
 * order must not expire on the payment timer, and there has to be something to
 * deliver, so a cart of downloads or a store pickup cannot use it.
 */

export type CodSettings = Pick<
  EcommerceSetting,
  "codEnabled" | "codFee" | "codMinimum" | "codMaximum"
>;

export type CodEligibility =
  | { ok: true; fee: number }
  | { ok: false; reason: string };

export function codEligibility(
  setting: CodSettings,
  input: {
    /** Goods total the courier will collect against, before the COD fee. */
    orderValue: number;
    /** Physical goods that a courier actually carries to the buyer. */
    requiresShipping: boolean;
    shippingMethodType: string | null;
  }
): CodEligibility {
  if (!setting.codEnabled) return { ok: false, reason: "COD tidak tersedia." };

  if (!input.requiresShipping) {
    return {
      ok: false,
      reason: "COD hanya untuk produk fisik yang dikirim kurir.",
    };
  }
  if (input.shippingMethodType === "PICKUP") {
    return {
      ok: false,
      reason: "COD tidak berlaku untuk ambil di lokasi.",
    };
  }
  if (input.orderValue < setting.codMinimum) {
    return {
      ok: false,
      reason: `Minimum belanja untuk COD ${formatPrice(setting.codMinimum)}.`,
    };
  }
  if (setting.codMaximum != null && input.orderValue > setting.codMaximum) {
    return {
      ok: false,
      reason: `Maksimum belanja untuk COD ${formatPrice(setting.codMaximum)}.`,
    };
  }

  return { ok: true, fee: Math.max(0, setting.codFee) };
}

/** The provider string stored on the payment row, and how it is recognised. */
export const COD_PROVIDER = "cod";

export function isCodPayment(provider: string | null | undefined) {
  return provider === COD_PROVIDER;
}
