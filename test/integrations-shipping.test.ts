import { describe, expect, it } from "vitest";

import {
  kiriminajaSearchDistricts,
  kiriminajaShippingPrice,
  mapDistricts,
  mapShippingPrice,
  parseCouriers,
} from "@/lib/integrations/shipping/kiriminaja";

describe("KiriminAja", () => {
  it("targets the sandbox or production host with a Bearer key", () => {
    const sandbox = kiriminajaSearchDistricts({ mode: "sandbox" }, "key", " Ngemplak ");
    expect(sandbox.url).toBe("https://tdev.kiriminaja.com/api/mitra/v2/get_address_by_name");
    expect(sandbox.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(sandbox.body!)).toEqual({ search: "Ngemplak" });
    expect(kiriminajaSearchDistricts({ mode: "production" }, "key", "abc").url).toMatch(/^https:\/\/client\.kiriminaja\.com\//);
  });

  it("prices in grams with the configured courier filter", () => {
    const request = kiriminajaShippingPrice({ mode: "sandbox", couriers: "JNE, jnt ,bad code!," }, "key", {
      origin: 5783,
      destination: 5507,
      weightGrams: 322.4,
      itemValue: 149990.9,
    });
    expect(request.url).toBe("https://tdev.kiriminaja.com/api/mitra/v6.1/shipping_price");
    expect(JSON.parse(request.body!)).toEqual({
      origin: 5783,
      destination: 5507,
      weight: 322,
      item_value: 149990,
      insurance: 0,
      courier: ["jne", "jnt"],
    });
    expect(JSON.parse(kiriminajaShippingPrice({}, "key", { origin: 1, destination: 2, weightGrams: 0 }).body!)).not.toHaveProperty("courier");
  });

  it("parses courier codes defensively", () => {
    expect(parseCouriers(" jne,SiCepat,,x,anteraja ")).toEqual(["jne", "sicepat", "anteraja"]);
    expect(parseCouriers(undefined)).toEqual([]);
  });

  it("maps districts from the documented response", () => {
    expect(
      mapDistricts({
        status: true,
        data: [
          { id: 1251, text: "Ngemplak, Kabupaten Boyolali, Jawa Tengah" },
          { id: null, text: "broken" },
        ],
      })
    ).toEqual([{ id: "1251", label: "Ngemplak, Kabupaten Boyolali, Jawa Tengah" }]);
    expect(mapDistricts({ status: false })).toEqual([]);
  });

  it("maps rates cheapest first and drops unpriced services", () => {
    const quotes = mapShippingPrice({
      status: true,
      results: [
        { service: "jne", service_name: "JNE Express Reguler", service_type: "REG23", cost: "12000", etd: "2-3" },
        { service: "jne", service_name: "JNE Express Flat", service_type: "FLREG23", cost: "10500", etd: "2-3" },
        { service: "sicepat", service_name: "SiCepat", service_type: "BEST", cost: "0", etd: "1" },
      ],
    });
    expect(quotes).toEqual([
      { courier: "jne", courierName: "JNE", service: "FLREG23", description: "JNE Express Flat", cost: 10500, etd: "2-3" },
      { courier: "jne", courierName: "JNE", service: "REG23", description: "JNE Express Reguler", cost: 12000, etd: "2-3" },
    ]);
  });
});
