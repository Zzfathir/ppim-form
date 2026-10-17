import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Underline-only text fields for the respondent form and onboarding: a quiet
 * hairline that, on focus, is overdrawn from the centre by a 2px line in the
 * accent color (`--line-accent`, defaulting to the brand accent). Invalid
 * fields (aria-invalid) show the danger color.
 */
const lineBase =
  "peer w-full rounded-none border-0 border-b border-input bg-transparent px-0 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-sm";

function Underline() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-center scale-x-0 bg-[var(--line-accent,var(--brand-accent))] transition-transform duration-300 ease-out peer-focus-visible:scale-x-100 peer-focus:scale-x-100 peer-aria-invalid:scale-x-100 peer-aria-invalid:bg-destructive motion-reduce:transition-none"
    />
  );
}

export function LineInput({ className, wrapperClassName, ...props }: React.ComponentProps<"input"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <input data-slot="line-input" className={cn(lineBase, "h-10", className)} {...props} />
      <Underline />
    </span>
  );
}

export function LineTextarea({ className, wrapperClassName, ...props }: React.ComponentProps<"textarea"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <textarea data-slot="line-textarea" className={cn(lineBase, "field-sizing-content min-h-10 resize-none", className)} {...props} />
      <Underline />
    </span>
  );
}
