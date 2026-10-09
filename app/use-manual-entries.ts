"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseStoredEntries, serializeEntries } from "../lib/entry-persistence";
import type { ManualChange, ManualEntriesLocalOnly, ManualEntriesSnapshot, ManualEntry, ManualRevision } from "../lib/manual-entries";
import { confirmChange, enqueueChange, legacyUploads, mergeEntries, parseOutbox, type OutboxItem, type SyncConflict, type ViewEntry } from "../lib/manual-sync";

// Browser-only store used before the shared server existed, and still used when none is configured.
export const LOCAL_ENTRIES_KEY = "praha6-volebni-odhad.entries.v1";
const OUTBOX_KEY = "praha6-volebni-odhad.outbox.v1";
const SNAPSHOT_KEY = "praha6-volebni-odhad.server-snapshot.v1";
const POLL_MS = 5_000;

export type ManualSyncMode =
  | "loading"
  | "server" // shared store answered on the last poll
  | "offline" // shared store unreachable; showing the last known server state plus unsent changes
  | "local_only" // no shared store configured: entries live in this browser only
  | "signed_out"; // session expired

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage full or disabled: the server copy still exists */ }
}

const now = () => new Date().toISOString();

export function useManualEntries() {
  const [mode, setMode] = useState<ManualSyncMode>("loading");
  const [serverEntries, setServerEntries] = useState<ManualEntry[]>([]);
  const [revisions, setRevisions] = useState<ManualRevision[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [localEntries, setLocalEntries] = useState<ViewEntry[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const outboxRef = useRef<OutboxItem[]>([]);
  const flushing = useRef(false);
  const modeRef = useRef<ManualSyncMode>("loading");
  // Incremented on every confirmed write; a poll that started before it carries stale entries.
  const writeEpoch = useRef(0);

  const updateOutbox = useCallback((next: OutboxItem[]) => {
    outboxRef.current = next;
    setOutbox(next);
    writeStorage(OUTBOX_KEY, JSON.stringify(next));
  }, []);

  const setModeBoth = useCallback((next: ManualSyncMode) => { modeRef.current = next; setMode(next); }, []);

  const flush = useCallback(async () => {
    if (flushing.current || modeRef.current === "local_only") return;
    flushing.current = true;
    try {
      while (outboxRef.current.length) {
        const [item] = outboxRef.current;
        let response: Response;
        try {
          response = await fetch("/api/manual-entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item.change) });
        } catch {
          setModeBoth("offline");
          return;
        }
        if (response.status === 401) { setModeBoth("signed_out"); return; }
        if (response.status >= 500) { setModeBoth("offline"); return; }
        const body = await response.json().catch(() => ({})) as { error?: string; revisionId?: number; current?: { author?: string } | null };
        if (response.ok && typeof body.revisionId === "number") {
          // Show the confirmed change at once (same render as leaving the outbox), so it never blinks
          // out until the next poll brings the authoritative server state.
          writeEpoch.current += 1;
          setServerEntries((current) => confirmChange(current, item.change, body.revisionId as number));
        }
        if (!response.ok) {
          const message = response.status === 409
            ? `Okrsek ${item.change.precinctNumber} mezitím změnil(a) ${body.current?.author ?? "někdo jiný"}. Vaše ${item.change.action === "delete" ? "smazání" : "hodnoty"} nebyly uloženy — zkontrolujte aktuální stav a případně zadejte znovu.`
            : `Okrsek ${item.change.precinctNumber}: server zápis odmítl (${body.error ?? response.status}).`;
          setConflicts((current) => [{ precinctNumber: item.change.precinctNumber, action: item.change.action, listVotes: item.change.listVotes, message, at: now() }, ...current]);
        }
        updateOutbox(outboxRef.current.filter((queued) => queued.change.clientId !== item.change.clientId));
      }
    } finally {
      flushing.current = false;
    }
  }, [setModeBoth, updateOutbox]);

  const refresh = useCallback(async () => {
    const epochAtStart = writeEpoch.current;
    try {
      const response = await fetch("/api/manual-entries", { cache: "no-store" });
      if (response.status === 401) { setModeBoth("signed_out"); return; }
      // No API at all (static preview): behave as the browser-only tool it was before.
      if (response.status === 404) { setModeBoth("local_only"); return; }
      if (!(response.headers.get("content-type") ?? "").includes("application/json") || !response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as ManualEntriesSnapshot | ManualEntriesLocalOnly;
      if (body.mode === "local_only") {
        setModeBoth("local_only");
        return;
      }
      if (writeEpoch.current === epochAtStart) {
        setServerEntries(body.entries);
        setRevisions(body.revisions);
        setLastSyncAt(body.generatedAt);
        writeStorage(SNAPSHOT_KEY, JSON.stringify(body));
      }
      setModeBoth("server");
      setLegacyCount(legacyUploads(parseStoredEntries(readStorage(LOCAL_ENTRIES_KEY)), body.entries, outboxRef.current, () => "").length);
      if (outboxRef.current.length) await flush();
    } catch {
      if (modeRef.current === "local_only") return;
      // Server unreachable: keep showing the last known shared state; nothing typed is discarded.
      if (modeRef.current === "loading") {
        try {
          const snapshot = JSON.parse(readStorage(SNAPSHOT_KEY) ?? "null") as ManualEntriesSnapshot | null;
          if (snapshot?.mode === "server") { setServerEntries(snapshot.entries); setRevisions(snapshot.revisions); setLastSyncAt(snapshot.generatedAt); }
        } catch { /* no usable snapshot */ }
      }
      setModeBoth("offline");
    }
  }, [flush, setModeBoth]);

  useEffect(() => {
    const restored = parseOutbox(readStorage(OUTBOX_KEY));
    outboxRef.current = restored;
    const start = window.setTimeout(() => {
      setOutbox(restored);
      setLocalEntries(parseStoredEntries(readStorage(LOCAL_ENTRIES_KEY)).map((entry) => ({ ...entry, revisionId: null, author: null, updatedAt: null, pending: false })));
      void refresh();
    }, 0);
    const timer = window.setInterval(() => { if (modeRef.current !== "local_only" && modeRef.current !== "signed_out") void refresh(); }, POLL_MS);
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => { window.clearTimeout(start); window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [refresh]);

  const entries = useMemo(() => mode === "local_only" ? localEntries : mergeEntries(serverEntries, outbox), [mode, localEntries, serverEntries, outbox]);

  const saveLocal = useCallback((next: ViewEntry[]) => {
    setLocalEntries(next);
    writeStorage(LOCAL_ENTRIES_KEY, serializeEntries(next.map(({ number, validVotes, listVotes }) => ({ number, validVotes, listVotes }))));
  }, []);

  const submit = useCallback((change: Omit<ManualChange, "clientId">) => {
    if (modeRef.current === "local_only") {
      const rest = localEntries.filter((entry) => entry.number !== change.precinctNumber);
      if (change.action === "delete") saveLocal(rest);
      else saveLocal([...rest, { number: change.precinctNumber, listVotes: change.listVotes ?? [], validVotes: (change.listVotes ?? []).reduce((sum, value) => sum + value, 0), revisionId: null, author: null, updatedAt: null, pending: false }].sort((left, right) => left.number - right.number));
      return;
    }
    updateOutbox(enqueueChange(outboxRef.current, { ...change, clientId: crypto.randomUUID() }, now()));
    void flush().then(() => refresh());
  }, [flush, localEntries, refresh, saveLocal, updateOutbox]);

  const save = useCallback((precinctNumber: number, listVotes: number[], basedOnRevision: number | null) => submit({ precinctNumber, action: "save", listVotes, basedOnRevision }), [submit]);
  const remove = useCallback((precinctNumber: number, basedOnRevision: number | null) => submit({ precinctNumber, action: "delete", listVotes: null, basedOnRevision }), [submit]);

  const uploadLegacy = useCallback(() => {
    const legacy = parseStoredEntries(readStorage(LOCAL_ENTRIES_KEY));
    let next = outboxRef.current;
    for (const change of legacyUploads(legacy, serverEntries, next, () => crypto.randomUUID())) next = enqueueChange(next, change, now());
    updateOutbox(next);
    // Keep a dated copy of the browser-only data instead of deleting it.
    writeStorage(`${LOCAL_ENTRIES_KEY}.uploaded-${now()}`, readStorage(LOCAL_ENTRIES_KEY) ?? "[]");
    try { window.localStorage.removeItem(LOCAL_ENTRIES_KEY); } catch { /* ignore */ }
    setLegacyCount(0);
    void flush().then(() => refresh());
  }, [flush, refresh, serverEntries, updateOutbox]);

  const dismissConflict = useCallback((index: number) => setConflicts((current) => current.filter((_, itemIndex) => itemIndex !== index)), []);

  return { mode, entries, revisions, outbox, conflicts, dismissConflict, lastSyncAt, legacyCount, uploadLegacy, save, remove, refresh };
}
