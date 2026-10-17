"use client";

import { ErrorView } from "@/components/error-view";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12">
      <ErrorView reset={reset} />
    </main>
  );
}
