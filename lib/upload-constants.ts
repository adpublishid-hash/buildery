// Shared by the upload API route, the server store helpers, and the
// client-side image picker — so it must not import "server-only".

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const ALLOWED_IMAGE_LABEL = "PNG, JPG, WEBP, or GIF · max 5 MB";

/**
 * Refund/return evidence: photos of the damage, or a scan of the return
 * receipt. PDF is allowed here (it is not for site imagery) because couriers
 * hand out PDF receipts.
 */
export const ALLOWED_EVIDENCE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

export const ALLOWED_EVIDENCE_LABEL = "PNG, JPG, WEBP, atau PDF · maks 5 MB";

/** Per refund request. Enough for a few angles plus a receipt. */
export const MAX_EVIDENCE_FILES = 5;
