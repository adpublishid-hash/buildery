import "server-only";

import { getActiveConnection, type LoadedConnection } from "@/lib/integrations/connections";
import { ProviderError, providerFetch } from "@/lib/integrations/http";
import {
  KIRIMINAJA_DESTINATION_PREFIX,
  kiriminajaSearchDistricts,
  kiriminajaShippingPrice,
  mapDistricts,
  mapShippingPrice,
} from "@/lib/integrations/shipping/kiriminaja";
import { prisma } from "@/lib/prisma";
import { calculateShipping, searchDestinations, type Destination, type ShippingQuote } from "@/lib/rajaongkir";

/**
 * Which live-rate provider a store's checkout uses, and one interface over
 * both: RajaOngkir (Komerce), configured in the eCommerce settings, or
 * KiriminAja, connected in the integration catalog. A switched-on KiriminAja
 * connection wins; the store turned it on on purpose.
 */

const DEFAULT_COURIERS = ["jne", "pos", "tiki", "jnt", "sicepat"];

export type ShippingProvider =
  | { kind: "kiriminaja"; connection: LoadedConnection; origin: number }
  | { kind: "rajaongkir"; apiKey: string; origin: string; couriers: string[] };

export async function resolveShippingProvider(workspaceId: string): Promise<ShippingProvider | null> {
  const connection = await getActiveConnection(workspaceId, "SHIPPING");
  const origin = Number(connection?.config.originDistrictId);
  if (connection?.provider.id === "kiriminaja" && connection.secrets.apiKey && Number.isInteger(origin) && origin > 0) {
    return { kind: "kiriminaja", connection, origin };
  }
  const setting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId },
    select: { rajaOngkirApiKey: true, shippingOriginCityId: true, shippingCouriers: true },
  });
  if (!setting?.rajaOngkirApiKey || !setting.shippingOriginCityId) return null;
  return {
    kind: "rajaongkir",
    apiKey: setting.rajaOngkirApiKey,
    origin: setting.shippingOriginCityId,
    couriers: setting.shippingCouriers?.length ? setting.shippingCouriers : DEFAULT_COURIERS,
  };
}

/** A cache key that changes when the provider or its account does. */
export function shippingCacheScope(provider: ShippingProvider) {
  return provider.kind === "kiriminaja"
    ? `ka:${provider.connection.id}:${provider.connection.config.mode}`
    : `ro:${provider.apiKey}`;
}

export async function kiriminajaDistricts(connection: Pick<LoadedConnection, "config">, apiKey: string, keyword: string) {
  const request = kiriminajaSearchDistricts(connection.config, apiKey, keyword);
  const response = await providerFetch("KiriminAja", request.url, { method: request.method, headers: request.headers, body: request.body });
  return mapDistricts(response);
}

export async function searchShippingDestinations(provider: ShippingProvider, keyword: string): Promise<Destination[]> {
  const q = keyword.trim();
  if (q.length < 3) return [];
  if (provider.kind === "rajaongkir") return searchDestinations(provider.apiKey, q);
  const districts = await kiriminajaDistricts(provider.connection, provider.connection.secrets.apiKey, q);
  return districts.map((district) => {
    // "Ngemplak, Kabupaten Sleman, DI Yogyakarta"
    const [name = "", city = "", province = ""] = district.label.split(",").map((part) => part.trim());
    return {
      id: `${KIRIMINAJA_DESTINATION_PREFIX}${district.id}`,
      label: district.label,
      province,
      city,
      district: name,
      subdistrict: "",
      zipCode: "",
    };
  });
}

export class StaleDestinationError extends Error {
  constructor() {
    super("Alamat tujuan perlu dipilih ulang.");
  }
}

export async function quoteShipping(
  provider: ShippingProvider,
  input: { destination: string; weightGrams: number; itemValue?: number }
): Promise<ShippingQuote[]> {
  const isKiriminaja = input.destination.startsWith(KIRIMINAJA_DESTINATION_PREFIX);
  if (provider.kind === "rajaongkir") {
    if (isKiriminaja) throw new StaleDestinationError();
    return calculateShipping(provider.apiKey, {
      origin: provider.origin,
      destination: input.destination,
      weight: Math.max(1, Math.floor(input.weightGrams || 1000)),
      couriers: provider.couriers,
      itemValue: input.itemValue,
    });
  }
  const destination = Number(input.destination.slice(KIRIMINAJA_DESTINATION_PREFIX.length));
  if (!isKiriminaja || !Number.isInteger(destination) || destination <= 0) throw new StaleDestinationError();
  const request = kiriminajaShippingPrice(provider.connection.config, provider.connection.secrets.apiKey, {
    origin: provider.origin,
    destination,
    weightGrams: input.weightGrams || 1000,
    itemValue: input.itemValue,
  });
  const response = await providerFetch<{ status?: boolean; text?: string }>("KiriminAja", request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  if (response && response.status === false) throw new ProviderError(`KiriminAja: ${response.text ?? "rates unavailable"}`);
  return mapShippingPrice(response);
}
