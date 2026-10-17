"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, type DraftQuestion } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";

/** A page break: everything after it (until the next one) is shown on a new page. */
export function SectionCard({
  question: q,
  page,
  pages,
  active,
  onActivate,
  onChange,
  onDelete,
}: {
  question: DraftQuestion;
  page: number;
  pages: number;
  active: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("builder");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={t("sectionLabel", { page, pages })}
      onFocusCapture={onActivate}
      onClick={onActivate}
      className={cn("relative pt-7", isDragging && "z-10 opacity-90")}
    >
      <span className="absolute top-0 left-0 rounded-t-md bg-foreground px-3 py-1 text-xs font-semibold text-background">
        {t("sectionLabel", { page, pages })}
      </span>
      <div className={cn("rounded-xl rounded-tl-none border-2 border-foreground/80 bg-card shadow-xs", active && "shadow-md")}>
        <div className="flex justify-center">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("dragSection", { page })}
            className="cursor-grab touch-none rounded px-4 pt-1 text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
          >
            <GripHorizontal className="size-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-2 px-4 pb-3 sm:px-6">
          <Textarea
            value={q.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={t("sectionPlaceholder")}
            aria-label={t("sectionTitle", { page })}
            maxLength={LIMITS.questionTitle}
            rows={1}
            className="field-sizing-content min-h-11 resize-none rounded-none border-0 border-b px-0 font-heading text-xl font-bold shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
          />
          <Textarea
            value={q.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || null })}
            placeholder={t("sectionDescription")}
            aria-label={t("sectionDescription")}
            maxLength={LIMITS.questionDescription}
            rows={1}
            className="field-sizing-content min-h-9 resize-none rounded-none border-0 border-b px-0 text-sm shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
          />
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("deleteSection", { page })}
              className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("removeSection")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
