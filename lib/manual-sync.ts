// Browser-side outbox for manual entries: every change waits here until the server confirms it,
// so a reload, a dropped connection or a server hiccup never loses what was typed.

import type { ManualChange, ManualEntry } from "./manual-entries.ts";

export type OutboxItem = { change: ManualChange; queuedAt: string };

export type ViewEntry = {
  number: number;
  validVotes: number;
  listVotes: number[];
  revisionId: number | null;
  author: string | null;
  updatedAt: string | null;
  pending: boolean;
};

export type SyncConflict = { precinctNumber: number; action: "save" | "delete"; listVotes: number[] | null; message: string; at: string };

const sum = (votes: number[]) => votes.reduce((total, value) => total + value, 0);

export function parseOutbox(value: string | null): OutboxItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is OutboxItem => Boolean(item?.change?.clientId) && typeof item.change.precinctNumber === "number") : [];
  } catch {
    return [];
  }
}

// A second edit of a precinct whose first edit has not been confirmed yet replaces it, but keeps
// the revision the person originally saw as its base. If the first edit did reach the server after
// all, the replacement is reported as a conflict instead of silently overwriting it.
export function enqueueChange(outbox: OutboxItem[], change: ManualChange, queuedAt: string): OutboxItem[] {
  const index = outbox.findIndex((item) => item.change.precinctNumber === change.precinctNumber);
  if (index === -1) return [...outbox, { change, queuedAt }];
  const previous = outbox[index].change;
  const rest = outbox.filter((_, itemIndex) => itemIndex !== index);
  // Deleting a brand-new precinct that never reached the server: nothing to send at all.
  if (change.action === "delete" && previous.action === "save" && previous.basedOnRevision === null) return rest;
  return [...rest, { change: { ...change, basedOnRevision: previous.basedOnRevision }, queuedAt }];
}

export function mergeEntries(serverEntries: ManualEntry[], outbox: OutboxItem[]): ViewEntry[] {
  const byNumber = new Map<number, ViewEntry>(serverEntries.map((entry) => [entry.number, { ...entry, pending: false }]));
  for (const { change } of outbox) {
    if (change.action === "delete") byNumber.delete(change.precinctNumber);
    else {
      const listVotes = change.listVotes ?? [];
      byNumber.set(change.precinctNumber, { number: change.precinctNumber, listVotes, validVotes: sum(listVotes), revisionId: byNumber.get(change.precinctNumber)?.revisionId ?? null, author: null, updatedAt: null, pending: true });
    }
  }
  return [...byNumber.values()].sort((left, right) => left.number - right.number);
}

// Applies a change the server has just confirmed to the last known server state.
export function confirmChange(serverEntries: ManualEntry[], change: ManualChange, revisionId: number): ManualEntry[] {
  const rest = serverEntries.filter((entry) => entry.number !== change.precinctNumber);
  if (change.action === "delete") return rest;
  const listVotes = change.listVotes ?? [];
  const previous = serverEntries.find((entry) => entry.number === change.precinctNumber);
  if (previous && previous.revisionId > revisionId) return serverEntries;
  return [...rest, { number: change.precinctNumber, listVotes, validVotes: sum(listVotes), revisionId, author: "vy", updatedAt: new Date().toISOString() }].sort((left, right) => left.number - right.number);
}

// Old browser-only entries that the server does not have yet, ready to upload as new records.
export function legacyUploads(legacy: Array<{ number: number; listVotes: number[] }>, serverEntries: ManualEntry[], outbox: OutboxItem[], newId: () => string): ManualChange[] {
  const known = new Set([...serverEntries.map((entry) => entry.number), ...outbox.map((item) => item.change.precinctNumber)]);
  return legacy
    .filter((entry) => !known.has(entry.number))
    .map((entry) => ({ clientId: newId(), precinctNumber: entry.number, action: "save", listVotes: entry.listVotes, basedOnRevision: null }));
}
