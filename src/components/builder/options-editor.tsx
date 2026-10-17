"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Circle, Square, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DraftQuestion } from "@/lib/forms/schema";
import { LIMITS } from "@/lib/forms/schema";

/** Option list for choice questions: Enter adds an option, Backspace on empty removes it. */
export function OptionsEditor({
  question: q,
  onChange,
}: {
  question: DraftQuestion;
  onChange: (patch: Partial<DraftQuestion>) => void;
}) {
  const t = useTranslations("builder");
  const options = q.options ?? [];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  const allowOther = q.type !== "dropdown" && q.settings.allow_other === true;

  useEffect(() => {
    if (focusIndex.current !== null) {
      refs.current[focusIndex.current]?.focus();
      refs.current[focusIndex.current]?.select();
      focusIndex.current = null;
    }
  });

  const setOptions = (next: string[]) => onChange({ options: next });

  function add(at = options.length) {
    if (options.length >= LIMITS.options) return;
    const next = [...options];
    next.splice(at, 0, t("option", { n: options.length + 1 }));
    focusIndex.current = at;
    setOptions(next);
  }

  function remove(i: number) {
    if (options.length <= 1) return;
    focusIndex.current = Math.max(0, i - 1);
    setOptions(options.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-1">
      {options.map((option, i) => (
        <div key={i} className="group flex items-center gap-3">
          <OptionMarker type={q.type} index={i} />
          <Input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={option}
            maxLength={LIMITS.option}
            aria-label={t("optionLabel", { n: i + 1 })}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(i + 1);
              } else if (e.key === "Backspace" && option === "" && options.length > 1) {
                e.preventDefault();
                remove(i);
              }
            }}
            className="h-9 rounded-none border-0 border-b border-transparent px-0 shadow-none hover:border-border focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
          />
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t("removeOption", { n: i + 1 })}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ))}

      {allowOther && (
        <div className="flex items-center gap-3">
          <OptionMarker type={q.type} index={options.length} />
          <span className="h-9 flex-1 border-b border-dotted pt-2 text-sm text-muted-foreground">{t("other")}</span>
          <button
            type="button"
            onClick={() => onChange({ settings: { ...q.settings, allow_other: false } })}
            aria-label={t("removeOther")}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-1 pl-7 text-sm">
        <button
          type="button"
          onClick={() => add()}
          className="rounded px-1 py-1.5 text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("addOption")}
        </button>
        {q.type !== "dropdown" && !allowOther && (
          <>
            <span className="text-muted-foreground">{t("or")}</span>
            <button
              type="button"
              onClick={() => onChange({ settings: { ...q.settings, allow_other: true } })}
              className="rounded px-1 py-1.5 font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("addOther")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function OptionMarker({ type, index }: { type: DraftQuestion["type"]; index: number }) {
  if (type === "single_choice") return <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  if (type === "multiple_choice") return <Square className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  return (
    <span className="w-4 shrink-0 text-right text-sm text-muted-foreground" aria-hidden>
      {index + 1}.
    </span>
  );
}
