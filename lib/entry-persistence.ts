import type { EnteredPrecinct } from "./forecast";

function isStoredEntry(value: unknown): value is EnteredPrecinct {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<EnteredPrecinct>;
  return Number.isInteger(entry.number)
    && typeof entry.validVotes === "number"
    && Number.isInteger(entry.validVotes)
    && entry.validVotes >= 0
    && Array.isArray(entry.listVotes)
    && entry.listVotes.every((vote) => Number.isInteger(vote) && vote >= 0)
    && entry.listVotes.reduce((sum, vote) => sum + vote, 0) === entry.validVotes;
}

export function serializeEntries(entries: EnteredPrecinct[]): string {
  return JSON.stringify(entries);
}

export function parseStoredEntries(value: string | null): EnteredPrecinct[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isStoredEntry) ? parsed : [];
  } catch {
    return [];
  }
}
