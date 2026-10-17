"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { deleteLookup, saveLookup, setLookupArchived, type AdminResult } from "@/app/(app)/admin/actions";

type Table = "departments" | "chapters" | "categories";
export type LookupRow = {
  id: string;
  name: string;
  description?: string | null;
  color?: string;
  sort?: number;
  archived: boolean;
  usage: Record<string, number>;
};
type Values = { name: string; description: string; color: string; sort: number };

/** Departments (name, description, color), chapters (name, description) and categories (name, order). */
export function LookupManager({ table, rows }: { table: Table; rows: LookupRow[] }) {
  const t = useTranslations("admin.lookups");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<LookupRow | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LookupRow | null>(null);
  const hasColor = table === "departments";
  const hasDescription = table !== "categories";
  const hasSort = table === "categories";

  function run(action: () => Promise<AdminResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else toast.error(te(res.error));
    });
  }

  const usageText = (row: LookupRow) =>
    Object.entries(row.usage)
      .map(([k, n]) => t(`usage.${k}`, { count: n }))
      .join(" · ");
  const unused = (row: LookupRow) => Object.values(row.usage).every((n) => n === 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t(`add.${table}`)}
        </Button>
      </div>

      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {rows.map((row) => (
          <li key={row.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", row.archived && "bg-muted/40")}>
            {hasColor && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", row.archived && "text-muted-foreground")}>
                {row.name}
                {row.archived && (
                  <span className="ml-2 rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground">
                    {table === "categories" ? t("inactive") : t("archived")}
                  </span>
                )}
              </p>
              {row.description && <p className="truncate text-sm text-muted-foreground">{row.description}</p>}
              <p className="text-xs text-muted-foreground">{usageText(row)}</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label={t("edit", { name: row.name })} onClick={() => setEditing(row)}>
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={row.archived ? t("restore", { name: row.name }) : t(table === "categories" ? "deactivate" : "archive", { name: row.name })}
                onClick={() =>
                  run(() => setLookupArchived(table, row.id, !row.archived), row.archived ? t("restoredToast") : t("archivedToast"))
                }
              >
                {row.archived ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}
              </Button>
              {unused(row) && (
                <Button variant="ghost" size="icon" aria-label={t("delete", { name: row.name })} onClick={() => setConfirmDelete(row)}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("archiveNote")}</p>

      <EditDialog
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        row={editing === "new" ? null : editing}
        table={table}
        hasColor={hasColor}
        hasDescription={hasDescription}
        hasSort={hasSort}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={(values) =>
          run(
            () =>
              saveLookup(table, editing === "new" || !editing ? null : editing.id, {
                name: values.name,
                description: hasDescription ? values.description || null : undefined,
                color: hasColor ? values.color : undefined,
                sort: hasSort ? values.sort : undefined,
              }),
            t("savedToast"),
            () => setEditing(null),
          )
        }
      />

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: confirmDelete?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {tc("cancel")}
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={() => run(() => deleteLookup(table, confirmDelete!.id), t("deletedToast"), () => setConfirmDelete(null))}
            >
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({
  open,
  row,
  table,
  hasColor,
  hasDescription,
  hasSort,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  row: LookupRow | null;
  table: Table;
  hasColor: boolean;
  hasDescription: boolean;
  hasSort: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Values) => void;
}) {
  const t = useTranslations("admin.lookups");
  const tc = useTranslations("common");
  const [values, setValues] = useState<Values>({
    name: row?.name ?? "",
    description: row?.description ?? "",
    color: row?.color ?? "#6B7280",
    sort: row?.sort ?? 0,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (values.name.trim()) onSave(values);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{row ? t("editTitle", { name: row.name }) : t(`add.${table}`)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lookup-name">{t("name")}</Label>
            <Input
              id="lookup-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              maxLength={120}
              required
              autoFocus
            />
          </div>
          {hasDescription && (
            <div className="space-y-2">
              <Label htmlFor="lookup-description">{t("description")}</Label>
              <Input
                id="lookup-description"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                maxLength={500}
              />
            </div>
          )}
          {hasColor && (
            <div className="space-y-2">
              <Label htmlFor="lookup-color">{t("color")}</Label>
              <div className="flex items-center gap-3">
                <input
                  id="lookup-color"
                  type="color"
                  value={values.color}
                  onChange={(e) => setValues((v) => ({ ...v, color: e.target.value.toUpperCase() }))}
                  className="h-9 w-14 cursor-pointer rounded-md border bg-card p-1"
                />
                <span className="font-mono text-sm text-muted-foreground">{values.color}</span>
              </div>
            </div>
          )}
          {hasSort && (
            <div className="space-y-2">
              <Label htmlFor="lookup-sort">{t("sort")}</Label>
              <Input
                id="lookup-sort"
                type="number"
                min={0}
                max={1000}
                value={values.sort}
                onChange={(e) => setValues((v) => ({ ...v, sort: Number(e.target.value) || 0 }))}
                className="w-28"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !values.name.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
