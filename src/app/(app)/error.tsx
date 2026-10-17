"use client";

import { ErrorView } from "@/components/error-view";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-5xl">
      <ErrorView reset={reset} />
    </div>
  );
}
