// Runs db/official-results.sql and the importer against a real Postgres engine (PGlite, in-memory).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { batchUrl, importAvailableBatches, importBatch } from "./official-import";
import { buildOfficialDashboard } from "./official-results";
import { loadDashboardRows, type OfficialDb } from "./official-store";

const schema = readFileSync(new URL("../db/official-results.sql", import.meta.url), "utf8");
const formatSample = readFileSync(new URL("./__fixtures__/csu-okrsky-format-sample.xml", import.meta.url), "utf8");
const liveNotYetAvailable = readFileSync(new URL("./__fixtures__/csu-okrsky-live-chyba-10.xml", import.meta.url), "utf8");

// Synthetic batches in the XSD structure; numbers are fictional.
function batch(number: number, precincts: Array<{ precinct: number; order: number; resent?: boolean; votes: number[] }>): string {
  const rows = precincts.map(({ precinct, order, resent = false, votes }) => {
    const total = votes.reduce((sum, value) => sum + value, 0);
    const lists = votes.map((value, index) => `<HLASY_OKRSEK POR_STR_HLAS_LIST="${index + 1}" HLASY="${value}"/>`).join("");
    return `<OKRSEK CIS_OBEC="554782" CIS_OKRSEK="${precinct}" KODZASTUP="500178" CIS_OBVODU="1" OZNAC_TYPU="MCMO" PORADI_ZPRAC="${order}" DATUM_CAS_ZPRAC="2026-10-10T15:00:00" OPAKOVANE="${resent}">`
      + `<UCAST_OKRSEK ZAPSANI_VOLICI="1000" VYDANE_OBALKY="500" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="500" PLATNE_LISTKY="490" PLATNE_HLASY="${total}"/>${lists}</OKRSEK>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><VYSLEDKY_OKRSKY xmlns="http://www.volby.cz/kv/" DATUM_CAS_GENEROVANI="2026-10-10T15:0${number}:00"><DAVKA DATUMVOLEB="20261009" PORADI_DAVKY="${number}" OKRSKY_DAVKA="${precincts.length}" OKRSKY_CELKEM="14000" OKRSKY_ZPRAC="${number * 10}"/>${rows}</VYSLEDKY_OKRSKY>`;
}

function fakeFetch(responses: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const body = responses[String(input)];
    if (body === undefined || typeof body === "number") return new Response("<html>404</html>", { status: typeof body === "number" ? body : 404, headers: { "content-type": "text/html" } });
    return new Response(body, { status: 200, headers: { "content-type": "text/xml" } });
  }) as typeof fetch;
}

let pg: PGlite;
let db: OfficialDb;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(schema);
  db = {
    async query<Row>(text: string, params: unknown[] = []) { return (await pg.query<Row>(text, params)).rows; },
    async transaction(statements) { await pg.transaction(async (tx) => { for (const statement of statements) await tx.query(statement.text, statement.params); }); },
  };
});

async function currentVotes(precinct: number) {
  const rows = await db.query<{ valid_votes: number; batch_number: number }>("select valid_votes, batch_number from official_current_precincts where precinct_number = $1", [precinct]);
  return rows[0];
}

describe("official results database", () => {
  it("imports batches in order, stops at the first missing one and keeps the hash verifiable", async () => {
    const steps = await importAvailableBatches(db, { fetchImpl: fakeFetch({ [batchUrl(1)]: formatSample, [batchUrl(2)]: liveNotYetAvailable }) });

    expect(steps.map((step) => step.outcome)).toEqual(["stored", "not_yet_available"]);
    const [run] = await db.query<{ ok: boolean; parser_version: string; batch_number: number }>("select encode(sha256(raw_payload), 'hex') = source_sha256 as ok, parser_version, batch_number from official_import_runs");
    expect(run).toEqual({ ok: true, parser_version: "csu-kv2026-okrsky@1", batch_number: 1 });
    expect(new TextDecoder().decode((await db.query<{ raw_payload: Uint8Array }>("select raw_payload from official_import_runs"))[0].raw_payload)).toBe(formatSample);
    const attempts = await db.query<{ outcome: string; detail: string }>("select outcome, detail from official_fetch_attempts order by id");
    expect(attempts).toEqual([{ outcome: "stored", detail: "2 okrsků Prahy 6" }, { outcome: "not_yet_available", detail: "KOD_CHYBY 10" }]);
  });

  it("picks the revision with the highest PORADI_ZPRAC even when an older one arrives later", async () => {
    const votes = (first: number) => [first, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    await importAvailableBatches(db, { fetchImpl: fakeFetch({
      [batchUrl(1)]: batch(1, [{ precinct: 6003, order: 20, votes: votes(100) }]),
      [batchUrl(2)]: batch(2, [{ precinct: 6003, order: 30, resent: true, votes: votes(120) }]),
      [batchUrl(3)]: batch(3, [{ precinct: 6003, order: 25, votes: votes(90) }]),
    }) });

    expect(await currentVotes(6003)).toEqual({ valid_votes: 120, batch_number: 2 });
    const revisions = await db.query("select 1 from official_precinct_revisions where precinct_number = 6003");
    expect(revisions).toHaveLength(3);
  });

  it("stores a real batch with invalid Praha 6 content as rejected, never exposes it, and moves on", async () => {
    const invalid = batch(1, [{ precinct: 6004, order: 1, votes: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }]).replace('POR_STR_HLAS_LIST="1"', 'POR_STR_HLAS_LIST="12"');
    const steps = await importAvailableBatches(db, { fetchImpl: fakeFetch({ [batchUrl(1)]: invalid, [batchUrl(2)]: formatSample.replace('PORADI_DAVKY="1"', 'PORADI_DAVKY="2"') }) });

    expect(steps.map((step) => step.outcome)).toEqual(["stored", "stored", "not_yet_available"]);
    expect(steps[0]).toMatchObject({ status: "rejected", reason: "neplatný obsah dávky: OKRSEK 6004 has unknown ballot list 12" });
    const rows = await loadDashboardRows(db);
    expect(rows.revisions.map((revision) => revision.precinctNumber)).toEqual([6001, 6002]);
    expect(rows.imports.map((summary) => [summary.batchNumber, summary.status, summary.precinctCount])).toEqual([[2, "accepted", 2], [1, "rejected", 0]]);
  });

  it.each([
    ["an HTML maintenance page served with 200", "<html>údržba</html>"],
    ["a truncated download", formatSample.slice(0, 900)],
    ["a different batch than requested", formatSample.replace('PORADI_DAVKY="1"', 'PORADI_DAVKY="9"')],
  ])("never skips a batch because of %s", async (_, body) => {
    expect(await importAvailableBatches(db, { fetchImpl: fakeFetch({ [batchUrl(1)]: body }) })).toMatchObject([{ outcome: "error" }]);
    expect(await db.query("select 1 from official_import_runs")).toHaveLength(0);

    // Next poll: ČSÚ now serves the real batch 1, which is imported normally.
    expect(await importAvailableBatches(db, { fetchImpl: fakeFetch({ [batchUrl(1)]: formatSample }) })).toMatchObject([{ outcome: "stored", status: "accepted" }, { outcome: "not_yet_available" }]);
  });

  it("records the same payload only once per parser version", async () => {
    const fetchImpl = fakeFetch({ [batchUrl(1)]: formatSample });
    await importBatch(db, 1, { fetchImpl });
    expect(await importBatch(db, 1, { fetchImpl })).toMatchObject({ outcome: "duplicate" });
    expect(await db.query("select 1 from official_import_runs")).toHaveLength(1);
  });

  it("refuses UPDATE, DELETE and TRUNCATE on every official table", async () => {
    await importBatch(db, 1, { fetchImpl: fakeFetch({ [batchUrl(1)]: formatSample }) });
    for (const statement of [
      "update official_precinct_revisions set valid_votes = 0",
      "delete from official_list_votes",
      "update official_import_runs set import_status = 'rejected', rejection_reason = 'x'",
      "delete from official_fetch_attempts",
      "truncate official_import_runs cascade",
    ]) await expect(pg.query(statement), statement).rejects.toThrow("append-only");
  });

  it("rejects a run whose stored bytes do not match its hash", async () => {
    await expect(pg.query(`insert into official_import_runs (id, source_url, batch_number, source_generated_at_local, fetched_at, source_sha256, raw_payload, parser_version, import_status)
      values (gen_random_uuid(), 'u', 1, now(), now(), $1, 'abc'::bytea, 'p', 'accepted')`, ["0".repeat(64)])).rejects.toThrow("official_import_runs_hash_matches");
  });

  it("feeds the dashboard from the current view, with discrepancies flagged", async () => {
    await importBatch(db, 1, { fetchImpl: fakeFetch({ [batchUrl(1)]: formatSample }) });
    const dashboard = buildOfficialDashboard({ connection: "connected", connectionMessage: "ok", ...(await loadDashboardRows(db)) }, 104);

    expect(dashboard.processedPrecincts).toBe(1);
    expect(dashboard.discrepancyPrecincts).toBe(1);
    expect(dashboard.precincts[0]).toMatchObject({ precinctNumber: 6001, validVotes: 660, listVotes: [100, 10, 0, 40, 0, 0, 300, 0, 0, 0, 210] });
    expect(dashboard.latestBatch).toMatchObject({ batchNumber: 1, status: "accepted", precinctCount: 2 });
    expect(dashboard.lastAttempt).toMatchObject({ outcome: "stored", requestedBatch: 1 });
  });
});
