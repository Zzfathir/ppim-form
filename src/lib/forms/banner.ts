import { publicEnv } from "@/lib/env";

export const BANNER_BUCKET = "form-banners";
export const BANNER_STYLES = ["edge", "inset", "overlay"] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];

/** Banners are in a public bucket under "<form id>/<random file name>". */
export function bannerUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/${path}`;
}

/** Banner images are resized in the browser to this width before upload (fast on mobile data). */
export const BANNER_MAX_WIDTH = 1600;
export const BANNER_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
