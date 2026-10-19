"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Copy, GripHorizontal, Image as ImageIcon, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, type DraftQuestion } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { IconAction } from "./question-card";
import { AddImageButton, ImageEditor, useImagePicker } from "./question-image";
import type { QuestionIssue } from "./question-meta";

/** An image block: a picture with an optional title, shown between questions and never answered. */
export function ImageCard({
  question: q,
  active,
  imageFolder,
  issue,
  onActivate,
  onChange,
  onDuplicate,
  onDelete,
}: {
  question: DraftQuestion;
  active: boolean;
  imageFolder: string;
  issue?: QuestionIssue;
  onActivate: () => void;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("builder.image");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const setImage = (patch: Pick<DraftQuestion["settings"], "image_path" | "image_alt">) =>
    onChange({ settings: { ...q.settings, ...patch } });
  const picker = useImagePicker(imageFolder, (image_path) => setImage({ image_path }));

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={t("block")}
      onFocusCapture={onActivate}
      onClick={onActivate}
      className={cn(
        "relative rounded-xl border bg-card shadow-xs",
        active && "shadow-md",
        isDragging && "z-10 opacity-90 shadow-lg",
        issue && !active && "border-destructive/60",
      )}
    >
      {active && <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-xl bg-brand" aria-hidden />}
      {picker.input}
      <div className="flex justify-center">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("drag")}
          className="cursor-grab touch-none rounded px-4 pt-1 text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripHorizontal className="size-5" aria-hidden />
        </button>
      </div>
      <div className="space-y-3 px-4 pb-3 sm:px-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <ImageIcon className="size-3.5" aria-hidden />
          {t("block")}
        </p>
        <Textarea
          value={q.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t("titlePlaceholder")}
          aria-label={t("titlePlaceholder")}
          maxLength={LIMITS.questionTitle}
          rows={1}
          className="field-sizing-content min-h-10 resize-none rounded-none border-0 border-b px-0 text-base shadow-none focus-visible:border-b-2 focus-visible:border-brand focus-visible:ring-0"
        />
        {q.settings.image_path ? (
          <ImageEditor settings={q.settings} uploading={picker.uploading} onReplace={picker.open} onChange={setImage} />
        ) : (
          <AddImageButton onClick={picker.open} uploading={picker.uploading} />
        )}
        <div className="flex justify-end gap-1 border-t pt-2">
          <IconAction label={t("duplicate")} onClick={onDuplicate}>
            <Copy className="size-5" aria-hidden />
          </IconAction>
          <IconAction label={t("delete")} onClick={onDelete}>
            <Trash2 className="size-5" aria-hidden />
          </IconAction>
        </div>
      </div>
      {issue && (
        <p className="flex items-center gap-1.5 border-t px-4 py-2 text-sm text-destructive sm:px-6">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {t("missing")}
        </p>
      )}
    </section>
  );
}
