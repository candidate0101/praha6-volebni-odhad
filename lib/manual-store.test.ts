// db/manual-entries.sql and the append logic against a real Postgres engine (PGlite, in-memory).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { ManualChange } from "./manual-entries";
import { appendManualChange, loadManualEntries, type ManualDb } from "./manual-store";

const schema = readFileSync(new URL("../db/manual-entries.sql", import.meta.url), "utf8");
const votes = (first: number) => [first, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
let counter = 0;
const change = (overrides: Partial<ManualChange>): ManualChange => ({
  clientId: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  precinctNumber: 6010,
  action: "save",
  listVotes: votes(100),
  basedOnRevision: null,
  ...overrides,
});

let pg: PGlite;
let db: ManualDb;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(schema);
  db = { async query<Row>(text: string, params: unknown[] = []) { return (await pg.query<Row>(text, params)).rows; } };
});

describe("shared manual entries", () => {
  it("stores entries with author and computes valid votes from the lists", async () => {
    expect(await appendManualChange(db, change({}), "Jana")).toEqual({ status: "stored", revisionId: 1 });
    const { entries, revisions } = await loadManualEntries(db);
    expect(entries).toMatchObject([{ number: 6010, listVotes: votes(100), validVotes: 155, revisionId: 1, author: "Jana" }]);
    expect(revisions).toMatchObject([{ id: 1, precinctNumber: 6010, action: "save", author: "Jana" }]);
  });

  it("keeps every revision and shows the newest one", async () => {
    await appendManualChange(db, change({}), "Jana");
    expect(await appendManualChange(db, change({ listVotes: votes(120), basedOnRevision: 1 }), "Petr")).toEqual({ status: "stored", revisionId: 2 });
    const { entries, revisions } = await loadManualEntries(db);
    expect(entries[0]).toMatchObject({ validVotes: 175, revisionId: 2, author: "Petr" });
    expect(revisions.map((revision) => revision.author)).toEqual(["Petr", "Jana"]);
  });

  it("reports a conflict instead of overwriting someone else's newer edit", async () => {
    await appendManualChange(db, change({}), "Jana");
    await appendManualChange(db, change({ listVotes: votes(120), basedOnRevision: 1 }), "Petr");
    const stale = await appendManualChange(db, change({ listVotes: votes(90), basedOnRevision: 1 }), "Eva");
    expect(stale).toEqual({ status: "conflict", current: { revisionId: 2, action: "save", author: "Petr" } });
    expect(await appendManualChange(db, change({ precinctNumber: 6010 }), "Eva")).toMatchObject({ status: "conflict" });
    expect((await loadManualEntries(db)).entries[0].validVotes).toBe(175);
  });

  it("lets only one of two simultaneous edits of the same revision win", async () => {
    await appendManualChange(db, change({}), "Jana");
    const results = await Promise.all([
      appendManualChange(db, change({ listVotes: votes(1), basedOnRevision: 1 }), "Petr"),
      appendManualChange(db, change({ listVotes: votes(2), basedOnRevision: 1 }), "Eva"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "stored"]);
    expect(await db.query("select 1 from manual_entry_revisions")).toHaveLength(2);
  });

  it("recognises a resent request instead of storing it twice", async () => {
    const first = change({});
    await appendManualChange(db, first, "Jana");
    expect(await appendManualChange(db, first, "Jana")).toEqual({ status: "already_stored", revisionId: 1 });
    expect(await db.query("select 1 from manual_entry_revisions")).toHaveLength(1);
  });

  it("deletes by appending a revision and allows a fresh entry afterwards", async () => {
    await appendManualChange(db, change({}), "Jana");
    expect(await appendManualChange(db, change({ action: "delete", listVotes: null, basedOnRevision: 1 }), "Jana")).toMatchObject({ status: "stored" });
    expect((await loadManualEntries(db)).entries).toEqual([]);
    expect(await appendManualChange(db, change({ listVotes: votes(7) }), "Petr")).toMatchObject({ status: "stored", revisionId: 3 });
    expect((await loadManualEntries(db)).entries[0]).toMatchObject({ revisionId: 3, author: "Petr" });
    expect(await db.query("select 1 from manual_entry_revisions")).toHaveLength(3);
  });

  it("refuses UPDATE, DELETE, TRUNCATE and out-of-range data at the database level", async () => {
    await appendManualChange(db, change({}), "Jana");
    for (const statement of ["update manual_entry_revisions set author = 'x'", "delete from manual_entry_revisions", "truncate manual_entry_revisions"]) {
      await expect(pg.query(statement), statement).rejects.toThrow("append-only");
    }
    const insert = "insert into manual_entry_revisions (precinct_number, action, list_votes, author, client_id) values ($1, 'save', $2::int[], 'x', gen_random_uuid())";
    await expect(pg.query(insert, [6200, votes(1)])).rejects.toThrow();
    await expect(pg.query(insert, [6011, [1, 2, 3]])).rejects.toThrow("manual_entry_revisions_votes");
    await expect(pg.query(insert, [6011, [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])).rejects.toThrow("manual_entry_revisions_votes");
  });
});
