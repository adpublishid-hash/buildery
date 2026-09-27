import "server-only";

/**
 * Parsing a pasted list of tracking numbers.
 *
 * A shop doing fifty parcels a day was typing each resi into its own order.
 * Couriers hand back a spreadsheet; this turns that into rows the importer can
 * apply, and — just as importantly — tells the seller exactly which lines it
 * could not use, instead of silently skipping them.
 */

export type TrackingRow = {
  orderNumber: string;
  trackingNumber: string;
  carrier: string | null;
};

export type TrackingParseResult = {
  rows: TrackingRow[];
  /** Lines that could not be read, with the reason, 1-indexed for the seller. */
  problems: { line: number; text: string; reason: string }[];
};

/** Header names the exports from Indonesian couriers tend to use. */
const ORDER_HEADERS = ["ordernumber", "order", "nomororder", "noorder", "invoice"];
const TRACKING_HEADERS = ["trackingnumber", "tracking", "resi", "noresi", "awb"];
const CARRIER_HEADERS = ["carrier", "courier", "kurir", "ekspedisi"];

function splitLine(line: string) {
  // Tab, comma or semicolon: whichever the spreadsheet happened to use.
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export const MAX_TRACKING_ROWS = 500;

export function parseTrackingImport(input: string): TrackingParseResult {
  const rows: TrackingRow[] = [];
  const problems: TrackingParseResult["problems"] = [];
  const seen = new Set<string>();

  const lines = input.split(/\r?\n/);
  let orderIndex = 0;
  let trackingIndex = 1;
  let carrierIndex = 2;
  let start = 0;

  // An optional header row lets the seller paste the courier's export as-is.
  const first = lines.find((line) => line.trim().length > 0);
  if (first) {
    const cells = splitLine(first).map(headerKey);
    const order = cells.findIndex((cell) => ORDER_HEADERS.includes(cell));
    const tracking = cells.findIndex((cell) => TRACKING_HEADERS.includes(cell));
    if (order !== -1 && tracking !== -1) {
      orderIndex = order;
      trackingIndex = tracking;
      carrierIndex = cells.findIndex((cell) => CARRIER_HEADERS.includes(cell));
      start = lines.indexOf(first) + 1;
    }
  }

  for (let i = start; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (rows.length >= MAX_TRACKING_ROWS) {
      problems.push({
        line: i + 1,
        text: raw.trim().slice(0, 120),
        reason: `Lebih dari ${MAX_TRACKING_ROWS} baris — sisanya diabaikan.`,
      });
      break;
    }

    const cells = splitLine(raw);
    const orderNumber = (cells[orderIndex] ?? "").trim();
    const trackingNumber = (cells[trackingIndex] ?? "").trim();
    const carrier =
      carrierIndex >= 0 ? (cells[carrierIndex] ?? "").trim() || null : null;

    if (!orderNumber || !trackingNumber) {
      problems.push({
        line: i + 1,
        text: raw.trim().slice(0, 120),
        reason: "Butuh nomor order dan nomor resi.",
      });
      continue;
    }

    const key = orderNumber.toUpperCase();
    if (seen.has(key)) {
      problems.push({
        line: i + 1,
        text: raw.trim().slice(0, 120),
        reason: "Nomor order ini muncul dua kali.",
      });
      continue;
    }
    seen.add(key);

    rows.push({
      orderNumber: orderNumber.slice(0, 60),
      trackingNumber: trackingNumber.slice(0, 120),
      carrier: carrier ? carrier.slice(0, 80) : null,
    });
  }

  return { rows, problems };
}
