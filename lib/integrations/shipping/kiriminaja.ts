// KiriminAja Mitra API, pure request builders and mappers (no network).
// https://developer.kiriminaja.com/docs — Bearer API key, JSON in and out.

import type { HttpRequest } from "../email/requests";

type Cfg = Record<string, string>;

/**
 * KiriminAja numbers its own kecamatan, unrelated to RajaOngkir's ids. The
 * prefix keeps a destination picked under one provider from ever being priced
 * by the other after the store switches.
 */
export const KIRIMINAJA_DESTINATION_PREFIX = "ka:";

export function kiriminajaBase(config: Cfg) {
  return config.mode === "production" ? "https://client.kiriminaja.com" : "https://tdev.kiriminaja.com";
}

function headers(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json" };
}

export function kiriminajaSearchDistricts(config: Cfg, apiKey: string, keyword: string): HttpRequest {
  return {
    method: "POST",
    url: `${kiriminajaBase(config)}/api/mitra/v2/get_address_by_name`,
    headers: headers(apiKey),
    body: JSON.stringify({ search: keyword.trim() }),
  };
}

export function parseCouriers(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z0-9_]{2,20}$/.test(code));
}

export function kiriminajaShippingPrice(
  config: Cfg,
  apiKey: string,
  input: { origin: number; destination: number; weightGrams: number; itemValue?: number }
): HttpRequest {
  const couriers = parseCouriers(config.couriers);
  return {
    method: "POST",
    url: `${kiriminajaBase(config)}/api/mitra/v6.1/shipping_price`,
    headers: headers(apiKey),
    body: JSON.stringify({
      origin: input.origin,
      destination: input.destination,
      weight: Math.max(1, Math.round(input.weightGrams)),
      item_value: Math.max(0, Math.floor(input.itemValue ?? 0)),
      insurance: 0,
      ...(couriers.length ? { courier: couriers } : {}),
    }),
  };
}

export type KiriminajaDistrict = { id: string; label: string };

export function mapDistricts(response: unknown): KiriminajaDistrict[] {
  const data = (response as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => row as { id?: unknown; text?: unknown })
    .filter((row) => (typeof row.id === "number" || typeof row.id === "string") && typeof row.text === "string")
    .map((row) => ({ id: String(row.id), label: String(row.text) }));
}

export type KiriminajaQuote = {
  courier: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
};

const COURIER_NAMES: Record<string, string> = {
  jne: "JNE",
  jnt: "J&T",
  sicepat: "SiCepat",
  anteraja: "AnterAja",
  idx: "ID Express",
  sap: "SAP",
  ninja: "Ninja Xpress",
  lion: "Lion Parcel",
  tiki: "TIKI",
  posindonesia: "POS Indonesia",
  ncs: "NCS",
  jtcargo: "J&T Cargo",
  sentral: "Sentral Cargo",
};

/** Express rates, cheapest first; services without a price are dropped. */
export function mapShippingPrice(response: unknown): KiriminajaQuote[] {
  const results = (response as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const quotes: KiriminajaQuote[] = [];
  for (const raw of results) {
    const row = raw as Record<string, unknown>;
    const courier = String(row.service ?? "").toLowerCase();
    const cost = Math.round(Number(row.cost));
    if (!courier || !Number.isFinite(cost) || cost <= 0) continue;
    const service = String(row.service_type ?? "") || "REG";
    quotes.push({
      courier,
      courierName: COURIER_NAMES[courier] ?? courier.toUpperCase(),
      service,
      description: String(row.service_name ?? service),
      cost,
      etd: String(row.etd ?? "").replace(/\s*(hari|days?)$/i, ""),
    });
  }
  return quotes.sort((a, b) => a.cost - b.cost);
}
