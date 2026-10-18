import { Skeleton } from "@/components/ui/skeleton";

/** Sits below the admin layout, so the superadmin check (and its redirect) runs before anything streams. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
