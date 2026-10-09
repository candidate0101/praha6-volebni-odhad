// Shared shapes and validation for manual precinct entries (browser and server).
// Official ČSÚ data never passes through here.

import { PRAHA6 } from "./praha6.ts";

export type ManualEntry = {
  number: number;
  validVotes: number;
  listVotes: number[];
  revisionId: number;
  author: string;
  updatedAt: string;
};

export type ManualRevision = {
  id: number;
  precinctNumber: number;
  action: "save" | "delete";
  author: string;
  createdAt: string;
};

export type ManualEntriesSnapshot = {
  mode: "server";
  entries: ManualEntry[];
  revisions: ManualRevision[];
  generatedAt: string;
};

// The server stores nothing: no database is configured (local development), entries stay in this browser.
export type ManualEntriesLocalOnly = { mode: "local_only"; reason: string };

export type ManualChange = {
  clientId: string;
  precinctNumber: number;
  action: "save" | "delete";
  listVotes: number[] | null;
  basedOnRevision: number | null;
};

export const MAX_VOTES_PER_LIST = 100_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPraha6Precinct(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= PRAHA6.firstPrecinct && (value as number) <= PRAHA6.lastPrecinct;
}

export function parseManualChange(input: unknown): { ok: true; change: ManualChange } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Chybí data zápisu." };
  const value = input as Record<string, unknown>;
  if (typeof value.clientId !== "string" || !UUID.test(value.clientId)) return { ok: false, error: "Chybí identifikátor zápisu." };
  if (!isPraha6Precinct(value.precinctNumber)) return { ok: false, error: `Okrsek musí být číslo ${PRAHA6.firstPrecinct}–${PRAHA6.lastPrecinct}.` };
  if (value.action !== "save" && value.action !== "delete") return { ok: false, error: "Neznámá akce." };
  const basedOn = value.basedOnRevision;
  if (basedOn !== null && !(Number.isSafeInteger(basedOn) && (basedOn as number) > 0)) return { ok: false, error: "Neplatná výchozí revize." };
  if (value.action === "delete") {
    if (basedOn === null) return { ok: false, error: "Smazat lze jen existující záznam." };
    return { ok: true, change: { clientId: value.clientId.toLowerCase(), precinctNumber: value.precinctNumber, action: "delete", listVotes: null, basedOnRevision: basedOn as number } };
  }
  const votes = value.listVotes;
  if (!Array.isArray(votes) || votes.length !== PRAHA6.ballotLists || !votes.every((vote) => Number.isInteger(vote) && vote >= 0 && vote <= MAX_VOTES_PER_LIST)) {
    return { ok: false, error: `Zadejte přesně ${PRAHA6.ballotLists} nezáporných celých hodnot (nejvýše ${MAX_VOTES_PER_LIST} na listinu).` };
  }
  return { ok: true, change: { clientId: value.clientId.toLowerCase(), precinctNumber: value.precinctNumber, action: "save", listVotes: votes as number[], basedOnRevision: basedOn as number | null } };
}

export function cleanAuthorName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}
