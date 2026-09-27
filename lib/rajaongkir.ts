import "server-only";

// Shipping cost provider client.
//
// The legacy RajaOngkir API (api.rajaongkir.com / pro.rajaongkir.com) was
// shut down after RajaOngkir was acquired by Komerce. New keys and the live
// endpoint live on the Komerce Collaborator platform:
//   - Search:    GET  /tariff/api/v1/destination/search?keyword=<q>&limit=10
//   - Calculate: POST /tariff/api/v1/calculate (form-encoded)
// Authentication is via the `x-api-key` request header. Override the base
// URL via env if Komerce changes domains (e.g. sandbox).
const BASE_URL =
  process.env.RAJAONGKIR_BASE_URL ||
  process.env.KOMERCE_BASE_URL ||
  "https://api.collaborator.komerce.id";

export type Destination = {
  id: string;
  label: string;        // human-friendly "Kediri, Kediri, Jawa Timur"
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  zipCode: string;
};

export type ShippingQuote = {
  courier: string;       // lowercase code: "jne", "jnt", "sicepat", "pos"
  courierName: string;   // "JNE", "POS Indonesia", ...
  service: string;       // "REG", "YES", "EZ", ...
  description: string;   // human description from the provider
  cost: number;          // rupiah, integer
  etd: string;           // estimated days, e.g. "2-3 day"
};

type KomerceEnvelope<T> = {
  meta?: { code?: number; status?: string; message?: string };
  data?: T;
};

async function komerce<T>(
  apiKey: string,
  path: string,
  init?: { method?: string; body?: URLSearchParams }
): Promise<T> {
  if (!apiKey) {
    throw new Error("API key kosong");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
        ...(init?.body
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: init?.body,
      cache: "no-store",
    });
  } catch (err) {
    // Network failure / DNS / TLS — surface clearly to the user.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Tidak bisa hubungi server ongkir: ${msg}`);
  }

  let json: KomerceEnvelope<T> | null = null;
  try {
    json = (await res.json()) as KomerceEnvelope<T>;
  } catch {
    json = null;
  }

  if (!res.ok || (json?.meta?.code && json.meta.code >= 400)) {
    const msg = json?.meta?.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(`${msg}`);
  }
  if (json?.data === undefined) {
    throw new Error("Respons ongkir kosong");
  }
  return json.data;
}

type RawDestination = {
  id: number | string;
  label?: string;
  province_name?: string;
  city_name?: string;
  district_name?: string;
  subdistrict_name?: string;
  zip_code?: string | number;
};

export async function searchDestinations(
  apiKey: string,
  keyword: string
): Promise<Destination[]> {
  const q = keyword.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ keyword: q, limit: "10" });
  const raw = await komerce<RawDestination[]>(
    apiKey,
    `/tariff/api/v1/destination/search?${params.toString()}`
  );
  return (raw ?? []).map((d) => ({
    id: String(d.id),
    label:
      d.label ||
      [d.subdistrict_name, d.district_name, d.city_name, d.province_name]
        .filter(Boolean)
        .join(", "),
    province: d.province_name ?? "",
    city: d.city_name ?? "",
    district: d.district_name ?? "",
    subdistrict: d.subdistrict_name ?? "",
    zipCode: d.zip_code != null ? String(d.zip_code) : "",
  }));
}

type RawQuote = {
  shipping_name?: string;     // "JNE"
  service_name?: string;      // "REG"
  shipping_cost?: number;
  shipping_cost_net?: number;
  grandtotal?: number;
  etd?: string;
  service_fee?: number;
  description?: string;
};
type RawCalculate = {
  calculate_reguler?: RawQuote[];
  calculate_cargo?: RawQuote[];
  calculate_instant?: RawQuote[];
};

/**
 * Returns shipping options from origin → destination for the given couriers.
 * The Komerce `/calculate` endpoint returns everything; we filter client-side
 * by the requested courier codes.
 */
export async function calculateShipping(
  apiKey: string,
  args: {
    origin: string;
    destination: string;
    weight: number;
    couriers: string[];
    itemValue?: number;
  }
): Promise<ShippingQuote[]> {
  const body = new URLSearchParams();
  body.set("shipper_destination_id", String(args.origin));
  body.set("receiver_destination_id", String(args.destination));
  body.set("weight", String(Math.max(0.1, args.weight / 1000))); // grams → kg
  body.set("item_value", String(Math.max(0, Math.floor(args.itemValue ?? 0))));
  body.set("cod", "no");

  const data = await komerce<RawCalculate>(
    apiKey,
    `/tariff/api/v1/calculate`,
    { method: "POST", body }
  );

  const allowed = new Set(
    args.couriers.map((c) => c.toLowerCase().trim()).filter(Boolean)
  );
  const all: RawQuote[] = [
    ...(data.calculate_reguler ?? []),
    ...(data.calculate_cargo ?? []),
    ...(data.calculate_instant ?? []),
  ];

  const options: ShippingQuote[] = [];
  for (const q of all) {
    const cost =
      typeof q.shipping_cost_net === "number" && q.shipping_cost_net > 0
        ? q.shipping_cost_net
        : typeof q.shipping_cost === "number"
          ? q.shipping_cost
          : typeof q.grandtotal === "number"
            ? q.grandtotal
            : 0;
    if (!q.shipping_name || cost <= 0) continue;
    const courierCode = q.shipping_name.toLowerCase().replace(/\s+/g, "");
    if (allowed.size > 0 && !allowed.has(courierCode)) continue;
    options.push({
      courier: courierCode,
      courierName: q.shipping_name,
      service: q.service_name || "REG",
      description: q.description || q.service_name || "",
      cost,
      etd: q.etd || "",
    });
  }
  options.sort((a, b) => a.cost - b.cost);
  return options;
}
