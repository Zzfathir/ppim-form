"use client";

import { useFormatter, useTranslations } from "next-intl";
import { DEFAULT_SCALE } from "@/lib/questions";
import type { DraftQuestion } from "@/lib/forms/schema";
import type {
  ChoiceStats,
  DateStats,
  QuestionStats,
  ScaleStats,
  Summary,
  TextStats,
} from "@/app/(app)/forms/[id]/responses-actions";

const OTHER = "__other__";
const MAX_DATES = 15;

/**
 * One card per question (Google Forms "Summary"). Every number is shown as
 * text next to its bar, so the bars are reinforcement, not the only carrier.
 */
export function SummaryView({
  summary,
  questions,
  onShowTable,
}: {
  summary: Summary;
  questions: DraftQuestion[];
  onShowTable: () => void;
}) {
  const stats = new Map(summary.questions.map((s) => [s.question_id, s]));
  return (
    <div className="space-y-3">
      {questions
        .filter((q) => q.type !== "section")
        .map((q, i) => (
          <QuestionSummary key={q.id} index={i} question={q} stats={stats.get(q.id)} onShowTable={onShowTable} />
        ))}
    </div>
  );
}

function QuestionSummary({
  question: q,
  index,
  stats,
  onShowTable,
}: {
  question: DraftQuestion;
  index: number;
  stats: QuestionStats | undefined;
  onShowTable: () => void;
}) {
  const t = useTranslations("responses");
  const answered = stats?.answered ?? 0;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6" aria-labelledby={`summary-${q.id}`}>
      <h3 id={`summary-${q.id}`} className="font-sans text-base font-medium whitespace-pre-wrap">
        {q.title || `#${index + 1}`}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("answered", { count: answered })}</p>

      <div className="mt-4">
        {answered === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAnswers")}</p>
        ) : q.type === "single_choice" || q.type === "dropdown" || q.type === "multiple_choice" ? (
          <ChoiceBars question={q} stats={stats as ChoiceStats} />
        ) : q.type === "scale" ? (
          <ScaleSummary question={q} stats={stats as ScaleStats} />
        ) : q.type === "date" ? (
          <DateList stats={stats as DateStats} />
        ) : (
          <TextList stats={stats as TextStats} onShowTable={onShowTable} />
        )}
      </div>
    </section>
  );
}

function percent(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/** Horizontal bar list in option order; "Other" last when used. */
function ChoiceBars({ question: q, stats }: { question: DraftQuestion; stats: ChoiceStats }) {
  const t = useTranslations("responses");
  const options = (q.options ?? []).filter((o) => o.trim() !== "");
  const rows = options.map((o) => ({ label: o, count: stats.counts[o] ?? 0 }));
  if (stats.counts[OTHER]) rows.push({ label: t("other"), count: stats.counts[OTHER] });
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <>
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const pct = percent(r.count, stats.answered);
          return (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_5.5rem]">
              <span className="truncate text-sm" title={r.label}>
                {r.label}
              </span>
              <span className="order-last col-span-2 h-2 rounded-full bg-muted sm:order-none sm:col-span-1" aria-hidden>
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: r.count === 0 ? 0 : `max(${(r.count / max) * 100}%, 4px)` }}
                />
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="font-medium">{r.count}</span>
                <span className="ml-1.5 text-muted-foreground">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
      {q.type === "multiple_choice" && <p className="mt-3 text-xs text-muted-foreground">{t("multiNote")}</p>}
    </>
  );
}

/** Average as the headline, then the distribution over every scale value (zeros included). */
function ScaleSummary({ question: q, stats }: { question: DraftQuestion; stats: ScaleStats }) {
  const t = useTranslations("responses");
  const format = useFormatter();
  const min = q.settings.min ?? DEFAULT_SCALE.min;
  const max = q.settings.max ?? DEFAULT_SCALE.max;
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const peak = Math.max(1, ...values.map((v) => stats.counts[String(v)] ?? 0));

  return (
    <div className="space-y-5">
      <p>
        <span className="text-sm text-muted-foreground">{t("average")}</span>{" "}
        <span className="font-heading text-3xl font-bold tabular-nums">
          {stats.average === null ? "–" : format.number(stats.average, { maximumFractionDigits: 2 })}
        </span>{" "}
        <span className="text-sm text-muted-foreground">{t("averageOf", { max })}</span>
      </p>
      <ol className="flex items-end gap-1.5" style={{ height: "8.5rem" }}>
        {values.map((v) => {
          const count = stats.counts[String(v)] ?? 0;
          return (
            <li key={v} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs font-medium tabular-nums">{count}</span>
              <span
                className="w-full max-w-10 rounded-t-[4px] bg-brand"
                style={{ height: count === 0 ? 0 : `max(${(count / peak) * 100}%, 4px)` }}
                aria-hidden
              />
              <span className="sr-only">
                {v}: {count}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="-mt-3 flex gap-1.5 border-t pt-1.5" aria-hidden>
        {values.map((v) => (
          <span key={v} className="flex-1 text-center text-xs text-muted-foreground tabular-nums">
            {v}
          </span>
        ))}
      </div>
      {(q.settings.min_label || q.settings.max_label) && (
        <p className="-mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{q.settings.min_label}</span>
          <span>{q.settings.max_label}</span>
        </p>
      )}
    </div>
  );
}

function DateList({ stats }: { stats: DateStats }) {
  const t = useTranslations("responses");
  const format = useFormatter();
  const shown = stats.dates.slice(0, MAX_DATES);
  const max = Math.max(1, ...shown.map((d) => d.count));
  return (
    <>
      <ul className="space-y-2">
        {shown.map((d) => (
          <li key={d.value} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
            <time dateTime={d.value} className="tabular-nums">
              {format.dateTime(new Date(`${d.value}T00:00:00`), { day: "numeric", month: "short", year: "numeric" })}
            </time>
            <span className="h-2 rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-brand" style={{ width: `max(${(d.count / max) * 100}%, 4px)` }} />
            </span>
            <span className="text-right font-medium tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
      {stats.dates.length > MAX_DATES && (
        <p className="mt-3 text-xs text-muted-foreground">{t("moreDates", { count: stats.dates.length - MAX_DATES })}</p>
      )}
    </>
  );
}

function TextList({ stats, onShowTable }: { stats: TextStats; onShowTable: () => void }) {
  const t = useTranslations("responses");
  return (
    <>
      <p className="sr-only">{t("latest")}</p>
      <ul className="space-y-1.5">
        {stats.latest.map((answer, i) => (
          <li key={i} className="rounded-md bg-muted/60 px-3 py-2 text-sm break-words whitespace-pre-wrap">
            {answer}
          </li>
        ))}
      </ul>
      {stats.answered > stats.latest.length && (
        <button
          type="button"
          onClick={onShowTable}
          className="mt-3 text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("moreInTable", { count: stats.answered })}
        </button>
      )}
    </>
  );
}
