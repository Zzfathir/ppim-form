"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "dirty" | "saving" | "offline" | "error";
type SaveResult = { ok: true } | { ok: false; error: string };

/** Errors that won't fix themselves by retrying; wait for the next edit instead. */
const NON_RETRYABLE = new Set(["answered_question_type_locked", "form_not_found", "forbidden", "invalid"]);
const RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000];

const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

/**
 * Debounced autosave with a single request in flight. Edits made while a save
 * is running are saved right after it. Transient failures retry with backoff;
 * offline edits are saved when the browser reconnects.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<SaveResult>, { delay = 800, enabled = true } = {}) {
  // "saved" vs "dirty" is derived from the last persisted snapshot; this holds the other states.
  const [status, setStatus] = useState<"idle" | "saving" | "offline" | "error">("idle");
  const [savedSnapshot, setSavedSnapshot] = useState(value);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const latest = useRef(value);
  const lastSeen = useRef(value);
  const version = useRef(0); // bumps on every change
  const savedVersion = useRef(0); // last version persisted
  const inFlight = useRef<Promise<SaveResult> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** Saves until the latest version is persisted, or stops on failure/offline. */
  const run = useCallback(async (): Promise<void> => {
    for (;;) {
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      if (version.current === savedVersion.current) return;
      if (isOffline()) {
        setStatus("offline");
        return;
      }

      const target = version.current;
      const snapshot = latest.current;
      setStatus("saving");
      const request = saveRef.current(snapshot).catch((): SaveResult => ({ ok: false, error: "network" }));
      inFlight.current = request;
      const result = await request;
      inFlight.current = null;

      if (!result.ok) {
        setErrorCode(result.error);
        if (isOffline()) {
          setStatus("offline");
          return;
        }
        setStatus("error");
        if (!NON_RETRYABLE.has(result.error)) {
          const wait = RETRY_DELAYS[Math.min(retries.current, RETRY_DELAYS.length - 1)];
          retries.current += 1;
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => window.dispatchEvent(new Event("ppi-autosave-retry")), wait);
        }
        return;
      }

      savedVersion.current = Math.max(savedVersion.current, target);
      retries.current = 0;
      setErrorCode(null);
      setSavedSnapshot(snapshot);
      setStatus("idle");
    }
  }, []);

  // Schedule a save whenever the value changes.
  useEffect(() => {
    latest.current = value;
    // Same value as last time (initial render, or React re-running effects in dev): nothing to save.
    if (Object.is(value, lastSeen.current)) return;
    lastSeen.current = value;
    if (!enabled) return;
    version.current += 1;
    retries.current = 0;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void run(), delay);
  }, [value, delay, enabled, run]);

  // Retry, reconnect, and warn before leaving with unsaved changes.
  useEffect(() => {
    const retry = () => void run();
    const offline = () => {
      if (version.current !== savedVersion.current) setStatus("offline");
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("ppi-autosave-retry", retry);
    window.addEventListener("online", retry);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("ppi-autosave-retry", retry);
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", beforeUnload);
      if (debounce.current) clearTimeout(debounce.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [run]);

  /** Save now (e.g. before publishing). Resolves true when everything is persisted. */
  const flush = useCallback(async () => {
    if (debounce.current) clearTimeout(debounce.current);
    await run();
    return version.current === savedVersion.current;
  }, [run]);

  const visible: SaveStatus =
    status !== "idle" ? status : enabled && !Object.is(value, savedSnapshot) ? "dirty" : "saved";
  return { status: visible, errorCode, flush };
}
