"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Link2Off, Loader2, RefreshCw, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSheetState, syncSheetNow, unlinkSheet, type SheetState } from "@/app/(app)/forms/[id]/sheets-actions";

/** Google Sheets link for one form: link, open, sync now, unlink, and error states. */
export function SheetsBar({ formId }: { formId: string }) {
  const t = useTranslations("sheets");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<SheetState | null>(null);
  const [busy, startTransition] = useTransition();
  const notified = useRef(false);

  useEffect(() => {
    getSheetState(formId).then(setState);
  }, [formId]);

  // Result of the Google round trip (?sheets=linked|cancelled|…), shown once.
  useEffect(() => {
    const result = params.get("sheets");
    if (!result || notified.current) return;
    notified.current = true;
    if (result === "linked") toast.success(t("linkedToast"));
    else toast.error(t(`result.${["cancelled", "not_configured", "forbidden", "scope_missing", "quota"].includes(result) ? result : "failed"}`));
    const q = new URLSearchParams(params);
    q.delete("sheets");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [params, pathname, router, t]);

  if (!state || !state.enabled) return null;
  const { sheet, canEdit } = state;

  if (!sheet) {
    if (!canEdit) return null;
    return (
      <form action="/api/google/link" method="post" className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs">
        <input type="hidden" name="formId" value={formId} />
        <Sheet className="size-5 shrink-0 text-success" aria-hidden />
        <p className="min-w-0 flex-1 text-muted-foreground">{t("pitch")}</p>
        <Button type="submit" variant="outline" size="sm">
          {t("link")}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs">
      {sheet.status === "error" ? (
        <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />
      ) : (
        <Sheet className="size-5 shrink-0 text-success" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("linked")}</p>
        <p className={sheet.status === "error" ? "text-destructive" : "text-muted-foreground"} role="status">
          {sheet.status === "error"
            ? t(`errors.${["access_revoked", "not_found", "quota"].includes(sheet.lastError ?? "") ? sheet.lastError : "failed"}`)
            : sheet.lastSyncedAt
              ? t("syncedAt", { when: format.relativeTime(new Date(sheet.lastSyncedAt), new Date()) })
              : t("syncPending")}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" asChild>
          <a href={sheet.url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            {t("open")}
          </a>
        </Button>
        {canEdit && sheet.status === "error" && sheet.lastError === "access_revoked" && (
          <form action="/api/google/link" method="post">
            <input type="hidden" name="formId" value={formId} />
            <Button type="submit" size="sm">
              {t("reconnect")}
            </Button>
          </form>
        )}
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const res = await syncSheetNow(formId);
                  if (res.status === "ok" || res.status === "busy") toast.success(t("syncedToast"));
                  else toast.error(t(`errors.${["access_revoked", "not_found", "quota"].includes(res.status) ? res.status : "failed"}`));
                  setState(await getSheetState(formId));
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              {t("syncNow")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  if (!window.confirm(t("unlinkConfirm"))) return;
                  const res = await unlinkSheet(formId);
                  if (res.ok) toast.success(t("unlinkedToast"));
                  setState(await getSheetState(formId));
                })
              }
            >
              <Link2Off aria-hidden />
              {t("unlink")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
