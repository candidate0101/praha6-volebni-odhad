// Append-only persistence for shared manual entries (schema: db/manual-entries.sql).

import type { ManualChange, ManualEntry, ManualRevision } from "./manual-entries.ts";
import type { OfficialDb } from "./official-store.ts";

// Same narrow client interface as the official store; a different database instance.
export type ManualDb = Pick<OfficialDb, "query">;

const ISO = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export async function loadManualEntries(db: ManualDb, revisionLimit = 40): Promise<{ entries: ManualEntry[]; revisions: ManualRevision[] }> {
  const entries = await db.query<Omit<ManualEntry, "validVotes">>(`
    select precinct_number::int as number, list_votes as "listVotes", id::int as "revisionId", author, ${ISO("created_at")} as "updatedAt"
    from manual_current_entries order by precinct_number`);
  const revisions = await db.query<ManualRevision>(`
    select id::int as id, precinct_number::int as "precinctNumber", action, author, ${ISO("created_at")} as "createdAt"
    from manual_entry_revisions order by id desc limit $1`, [revisionLimit]);
  return {
    entries: entries.map((entry) => {
      const listVotes = entry.listVotes.map(Number);
      return { ...entry, listVotes, validVotes: listVotes.reduce((sum, votes) => sum + votes, 0) };
    }),
    revisions,
  };
}

export type AppendResult =
  | { status: "stored"; revisionId: number }
  | { status: "already_stored"; revisionId: number }
  | { status: "conflict"; current: { revisionId: number; action: "save" | "delete"; author: string } | null };

async function latestRevision(db: ManualDb, precinctNumber: number) {
  const [row] = await db.query<{ revisionId: number; action: "save" | "delete"; author: string }>(
    `select id::int as "revisionId", action, author from manual_entry_revisions where precinct_number = $1 order by id desc limit 1`, [precinctNumber]);
  return row ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

// Inserts the change only if it builds on the precinct's latest revision. The unique
// (precinct_number, based_on_revision) constraint closes the race between two simultaneous writers.
export async function appendManualChange(db: ManualDb, change: ManualChange, author: string): Promise<AppendResult> {
  const [replayed] = await db.query<{ id: number; precinct_number: number }>("select id::int as id, precinct_number::int as precinct_number from manual_entry_revisions where client_id = $1", [change.clientId]);
  if (replayed) return replayed.precinct_number === change.precinctNumber ? { status: "already_stored", revisionId: replayed.id } : { status: "conflict", current: await latestRevision(db, change.precinctNumber) };

  const latest = await latestRevision(db, change.precinctNumber);
  // A new entry may also follow a deletion: the client then sees no record and sends no base.
  const expectedBase = latest && latest.action === "delete" && change.basedOnRevision === null && change.action === "save" ? latest.revisionId : change.basedOnRevision;
  if ((latest?.revisionId ?? null) !== expectedBase) return { status: "conflict", current: latest };
  if (change.action === "delete" && latest?.action !== "save") return { status: "conflict", current: latest };

  try {
    const [row] = await db.query<{ id: number }>(
      `insert into manual_entry_revisions (precinct_number, action, list_votes, author, client_id, based_on_revision)
       values ($1, $2, $3::int[], $4, $5, $6) returning id::int as id`,
      [change.precinctNumber, change.action, change.listVotes, author, change.clientId, expectedBase],
    );
    return { status: "stored", revisionId: row.id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [sameClient] = await db.query<{ id: number }>("select id::int as id from manual_entry_revisions where client_id = $1", [change.clientId]);
    if (sameClient) return { status: "already_stored", revisionId: sameClient.id };
    return { status: "conflict", current: await latestRevision(db, change.precinctNumber) };
  }
}
