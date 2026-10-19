import { publicEnv } from "@/lib/env";

export const BANNER_BUCKET = "form-banners";
export const BANNER_STYLES = ["edge", "inset", "overlay"] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];

/** Banners are in a public bucket under "<form id>/<random file name>". */
export function bannerUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/${path}`;
}

/** Question images share the bucket, under the folder of their form (or template). */
export const imageUrl = bannerUrl;

/** Stored paths: "<uuid folder>/<file name>" (also checked by the database). */
export const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/;

/** Images are resized in the browser to this width before upload (fast on mobile data). */
export const BANNER_MAX_WIDTH = 1600;
export const BANNER_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
