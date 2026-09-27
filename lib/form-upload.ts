import "server-only";

import path from "node:path";
import { rm } from "node:fs/promises";

export const PRIVATE_FORM_UPLOAD_ROOT = path.join(
  process.cwd(),
  "storage",
  "form-submissions"
);

export type DetectedUploadType = {
  mimeType: string;
  extension: "png" | "jpg" | "webp" | "gif" | "pdf";
};

export function detectFormUploadType(bytes: Uint8Array): DetectedUploadType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  const header = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
    return { mimeType: "image/gif", extension: "gif" };
  }
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  return null;
}

export function resolvePrivateFormUpload(storageKey: string) {
  if (!/^[a-zA-Z0-9_-]+\/[a-f0-9-]+\.(png|jpg|webp|gif|pdf)$/.test(storageKey)) {
    return null;
  }
  const absolute = path.resolve(PRIVATE_FORM_UPLOAD_ROOT, storageKey);
  const root = `${path.resolve(PRIVATE_FORM_UPLOAD_ROOT)}${path.sep}`;
  return absolute.startsWith(root) ? absolute : null;
}

export async function deleteFormSubmissionUploads(submissionId: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) return false;
  const directory = path.resolve(PRIVATE_FORM_UPLOAD_ROOT, submissionId);
  const root = `${path.resolve(PRIVATE_FORM_UPLOAD_ROOT)}${path.sep}`;
  if (!directory.startsWith(root)) return false;
  await rm(directory, { recursive: true, force: true });
  return true;
}

export async function deleteManyFormSubmissionUploads(submissionIds: string[]) {
  const results = await Promise.allSettled(
    submissionIds.map((id) => deleteFormSubmissionUploads(id))
  );
  return {
    removed: results.filter(
      (result) => result.status === "fulfilled" && result.value
    ).length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
