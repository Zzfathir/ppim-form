import Link from "next/link";
import { cn } from "@/lib/utils";

/** A headline number. When `href` is set the whole card is a link (e.g. pending approvals → People). */
export function KpiCard({
  label,
  value,
  hint,
  href,
  highlight,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const className = cn(
    "block rounded-xl border bg-card p-4 shadow-xs",
    highlight && "border-brand/40 bg-brand-soft",
    href && "transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
