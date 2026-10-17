import { publicEnv } from "@/lib/env";

export function sharePath(slug: string) {
  return `/f/${slug}`;
}

export function shareUrl(slug: string) {
  return `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${sharePath(slug)}`;
}
