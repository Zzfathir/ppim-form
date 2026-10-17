import Link from "next/link";

export type BarItem = { key: string; label: string; value: number; dotColor?: string | null; href?: string };

/**
 * Labelled horizontal bars for counts per category (single series, brand hue).
 * Every value is printed as text; the bar only reinforces it. An optional dot
 * carries an entity's own color (e.g. a department) next to its label.
 */
export function BarList({ items, emptyLabel }: { items: BarItem[]; emptyLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.every((i) => i.value === 0)) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const label = (
          <span className="flex min-w-0 items-center gap-1.5">
            {item.dotColor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.dotColor }} aria-hidden />}
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
          </span>
        );
        return (
          <li key={item.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
            {item.href ? (
              <Link href={item.href} className="min-w-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                {label}
              </Link>
            ) : (
              label
            )}
            <span className="h-2 rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: item.value === 0 ? 0 : `max(${(item.value / max) * 100}%, 4px)` }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">{item.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
