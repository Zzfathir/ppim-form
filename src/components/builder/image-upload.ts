"use client";

import { createClient } from "@/lib/supabase/client";
import { BANNER_BUCKET, BANNER_MAX_UPLOAD_BYTES, BANNER_MAX_WIDTH } from "@/lib/forms/banner";

export const IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const RAW_LIMIT = 20 * 1024 * 1024; // before resizing

export type UploadError = "wrongType" | "tooLarge" | "uploadFailed";

/** Resize to at most BANNER_MAX_WIDTH wide and re-encode (WebP, JPEG fallback) to keep images light on mobile data. */
async function prepareImage(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, BANNER_MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode_failed");
  return { blob: jpeg, ext: "jpg" };
}

/**
 * Uploads a banner or question image into "<folder>/<random name>" (folder = the
 * form's or template's id; Storage policies only allow folders the user can edit).
 * Files are never overwritten.
 */
export async function uploadImage(folder: string, file: File): Promise<{ path: string } | { error: UploadError }> {
  if (!IMAGE_ACCEPT.includes(file.type)) return { error: "wrongType" };
  if (file.size > RAW_LIMIT) return { error: "tooLarge" };
  try {
    const { blob, ext } = await prepareImage(file);
    if (blob.size > BANNER_MAX_UPLOAD_BYTES) return { error: "tooLarge" };
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient()
      .storage.from(BANNER_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
    return error ? { error: "uploadFailed" } : { path };
  } catch {
    return { error: "uploadFailed" };
  }
}
