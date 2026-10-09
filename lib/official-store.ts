// Append-only persistence for official ČSÚ batches (schema: db/official-results.sql).
// Works against any Postgres client that implements OfficialDb (Neon in production, PGlite in tests).

import type { ParsedPrecinct } from "./csu-okrsky.ts";
import type { OfficialFetchAttempt, OfficialImportSummary, OfficialPrecinctRevision } from "./official-results.ts";

export type SqlStatement = { text: string; params: unknown[] };

export type OfficialDb = {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
  transaction(statements: SqlStatement[]): Promise<void>;
};

export type StoredRun = {
  sourceUrl: string;
  batchNumber: number;
  generatedAtLocal: string;
  fetchedAt: string;
  sha256: string;
  rawPayloadHex: string;
  parserVersion: string;
  status: "accepted" | "rejected";
  rejectionReason: string | null;
  nationalPrecinctsTotal: number | null;
  nationalPrecinctsProcessed: number | null;
  precincts: ParsedPrecinct[];
};

const ISO = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export async function lastStoredBatch(db: OfficialDb): Promise<number> {
  const [row] = await db.query<{ batch: number }>("select coalesce(max(batch_number), 0)::int as batch from official_import_runs");
  return row.batch;
}

export async function runExists(db: OfficialDb, sha256: string, parserVersion: string): Promise<boolean> {
  const rows = await db.query("select 1 from official_import_runs where source_sha256 = $1 and parser_version = $2", [sha256, parserVersion]);
  return rows.length > 0;
}

export async function recordAttempt(db: OfficialDb, attempt: Omit<OfficialFetchAttempt, "attemptedAt"> & { sha256?: string | null }): Promise<void> {
  await db.query(
    "insert into official_fetch_attempts (source_url, requested_batch, http_status, outcome, source_sha256, detail) values ($1, $2, $3, $4, $5, $6)",
    [attempt.sourceUrl, attempt.requestedBatch, attempt.httpStatus, attempt.outcome, attempt.sha256 ?? null, attempt.detail],
  );
}

export function storeRunStatements(run: StoredRun, newId: () => string = () => crypto.randomUUID()): SqlStatement[] {
  const runId = newId();
  const statements: SqlStatement[] = [{
    text: `insert into official_import_runs (id, source_url, batch_number, source_generated_at_local, fetched_at, source_sha256, raw_payload, parser_version, import_status, rejection_reason, national_precincts_total, national_precincts_processed)
      values ($1, $2, $3, $4::timestamp, $5::timestamptz, $6, decode($7, 'hex'), $8, $9, $10, $11, $12)`,
    params: [runId, run.sourceUrl, run.batchNumber, run.generatedAtLocal, run.fetchedAt, run.sha256, run.rawPayloadHex, run.parserVersion, run.status, run.rejectionReason, run.nationalPrecinctsTotal, run.nationalPrecinctsProcessed],
  }];
  // A rejected batch keeps its raw bytes for review but contributes no precinct revisions.
  if (run.status === "rejected") return statements;
  for (const precinct of run.precincts) {
    const revisionId = newId();
    statements.push({
      text: `insert into official_precinct_revisions (id, import_run_id, precinct_number, processing_order, processed_at_local, resent, registered_voters, issued_envelopes, returned_envelopes, valid_ballots, valid_votes, validation_status, validation_note)
        values ($1, $2, $3, $4, $5::timestamp, $6, $7, $8, $9, $10, $11, $12, $13)`,
      params: [revisionId, runId, precinct.precinctNumber, precinct.processingOrder, precinct.processedAtLocal, precinct.resent, precinct.registeredVoters, precinct.issuedEnvelopes, precinct.returnedEnvelopes, precinct.validBallots, precinct.validVotes, precinct.validationStatus, precinct.validationNote],
    });
    statements.push({
      text: "insert into official_list_votes (precinct_revision_id, ballot_number, votes) select $1, ordinality, votes from unnest($2::int[]) with ordinality as list(votes, ordinality)",
      params: [revisionId, precinct.listVotes],
    });
  }
  return statements;
}

export async function loadDashboardRows(db: OfficialDb, importLimit = 50): Promise<{ revisions: OfficialPrecinctRevision[]; imports: OfficialImportSummary[]; lastAttempt: OfficialFetchAttempt | null }> {
  const revisions = await db.query<OfficialPrecinctRevision>(`
    select current.precinct_number::int as "precinctNumber", current.batch_number::int as "batchNumber",
      current.processing_order::int as "processingOrder", current.resent, current.valid_votes::int as "validVotes",
      array(select votes from official_list_votes where precinct_revision_id = current.revision_id order by ballot_number) as "listVotes",
      current.validation_status as "validationStatus", current.validation_note as "validationNote",
      current.source_url as "sourceUrl", current.source_sha256::text as "sourceSha256", ${ISO("current.fetched_at")} as "fetchedAt"
    from official_current_precincts current order by current.precinct_number`);
  const imports = await db.query<OfficialImportSummary>(`
    select run.batch_number::int as "batchNumber", ${ISO("run.fetched_at")} as "fetchedAt", run.source_url as "sourceUrl",
      run.source_sha256::text as "sourceSha256", run.parser_version as "parserVersion", run.import_status as status,
      run.rejection_reason as "rejectionReason",
      (select count(*)::int from official_precinct_revisions revision where revision.import_run_id = run.id) as "precinctCount"
    from official_import_runs run order by run.batch_number desc, run.fetched_at desc limit $1`, [importLimit]);
  const [lastAttempt] = await db.query<OfficialFetchAttempt>(`
    select ${ISO("attempted_at")} as "attemptedAt", source_url as "sourceUrl", requested_batch::int as "requestedBatch",
      http_status::int as "httpStatus", outcome, detail
    from official_fetch_attempts order by id desc limit 1`);
  return { revisions: revisions.map((row) => ({ ...row, listVotes: row.listVotes.map(Number) })), imports, lastAttempt: lastAttempt ?? null };
}
