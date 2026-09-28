import "server-only";

import { quoteShipping } from "@/lib/shipping/rates";

import type { LoadedConnection } from "../connections";
import { asTestResult, type TestResult } from "../http";
import { KIRIMINAJA_DESTINATION_PREFIX } from "./kiriminaja";

/** Prices a 1 kg parcel from the origin to itself: proves the key and the origin id. */
export async function testShippingConnection(connection: LoadedConnection): Promise<TestResult> {
  return asTestResult(async () => {
    if (connection.provider.id !== "kiriminaja") throw new Error(`${connection.provider.name} cannot be tested yet.`);
    const origin = Number(connection.config.originDistrictId);
    if (!Number.isInteger(origin) || origin <= 0) throw new Error("Set the origin kecamatan ID first.");
    const quotes = await quoteShipping(
      { kind: "kiriminaja", connection, origin },
      { destination: `${KIRIMINAJA_DESTINATION_PREFIX}${origin}`, weightGrams: 1000 }
    );
    if (quotes.length === 0) {
      throw new Error("Connected, but no courier returned a rate from this origin. Check the kecamatan ID and courier list.");
    }
    const couriers = new Set(quotes.map((quote) => quote.courierName));
    return `Connected. ${quotes.length} services from ${couriers.size} couriers; cheapest 1 kg local rate Rp${quotes[0].cost.toLocaleString("id-ID")}.`;
  });
}
