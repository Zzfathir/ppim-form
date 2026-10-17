"use client";

import { useFormatter } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type SeriesPoint = { bucket: string; count: number };

/**
 * Single-series count over time: 2px line with a light area, recessive grid,
 * crosshair tooltip. A visually hidden table carries the same data for
 * screen readers.
 */
export function TimeSeriesChart({
  data,
  bucket,
  label,
  valueLabel,
}: {
  data: SeriesPoint[];
  bucket: "day" | "week";
  label: string;
  valueLabel: string;
}) {
  const format = useFormatter();
  const fmt = (b: string, long = false) =>
    format.dateTime(new Date(`${b}T00:00:00`), long ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });

  return (
    <figure>
      <div className="h-52 w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id={`fill-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(b: string) => fmt(b)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={(props) => {
                const point = props.payload?.[0];
                if (!props.active || !point) return null;
                const b = String(props.label);
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <p className="text-muted-foreground">{bucket === "week" ? `${fmt(b, true)} +6` : fmt(b, true)}</p>
                    <p className="font-semibold tabular-nums">
                      {point.value} {valueLabel}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--brand-accent)"
              strokeWidth={2}
              fill={`url(#fill-${label.replace(/\W/g, "")})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((p) => (
            <tr key={p.bucket}>
              <th scope="row">{fmt(p.bucket, true)}</th>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
