import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { handleEntriesGet, handleEntriesPost, handleSessionGet, handleSessionPost, type ManualApiDeps } from "./manual-api";
import type { ManualDb } from "./manual-store";

const schema = readFileSync(new URL("../db/manual-entries.sql", import.meta.url), "utf8");
const auth = { kind: "enabled" as const, password: "volebni-noc-2026", secret: "s".repeat(40) };
const ORIGIN = "https://p6.example";
const votes = [10, 0, 0, 0, 0, 0, 20, 0, 0, 0, 5];

let db: ManualDb;
let deps: ManualApiDeps;

beforeEach(async () => {
  const pg = new PGlite();
  await pg.exec(schema);
  db = { async query<Row>(text: string, params: unknown[] = []) { return (await pg.query<Row>(text, params)).rows; } };
  deps = { db, auth };
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, host: "p6.example", ...headers }, body: JSON.stringify(body) });
}

async function login(name = "Jana") {
  const response = await handleSessionPost(post("/api/session", { name, password: auth.password }), deps);
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("manual entries API", () => {
  it("requires the team password before anything can be read or written", async () => {
    expect((await handleEntriesGet(new Request(`${ORIGIN}/api/manual-entries`), deps)).status).toBe(401);
    expect((await handleEntriesPost(post("/api/manual-entries", {}), deps)).status).toBe(401);
    expect((await handleSessionPost(post("/api/session", { name: "Jana", password: "spatne-heslo" }), deps)).status).toBe(401);
    expect(await (await handleSessionGet(new Request(`${ORIGIN}/api/session`), deps)).json()).toEqual({ required: true, authenticated: false, name: null });
  });

  it("lets a logged-in person write, records their name, and shows it to everyone", async () => {
    const jana = await login("Jana");
    const write = await handleEntriesPost(post("/api/manual-entries", { clientId: crypto.randomUUID(), precinctNumber: 6042, action: "save", listVotes: votes, basedOnRevision: null }, { cookie: jana }), deps);
    expect(write.status).toBe(200);

    const petr = await login("Petr");
    const read = await (await handleEntriesGet(new Request(`${ORIGIN}/api/manual-entries`, { headers: { cookie: petr } }), deps)).json();
    expect(read).toMatchObject({ mode: "server", entries: [{ number: 6042, validVotes: 35, author: "Jana" }] });
  });

  it("returns 409 with the current author when the base revision is outdated", async () => {
    const jana = await login("Jana");
    const body = (basedOnRevision: number | null, list = votes) => ({ clientId: crypto.randomUUID(), precinctNumber: 6042, action: "save", listVotes: list, basedOnRevision });
    await handleEntriesPost(post("/api/manual-entries", body(null), { cookie: jana }), deps);
    await handleEntriesPost(post("/api/manual-entries", body(1, votes.map((value) => value + 1)), { cookie: jana }), deps);
    const stale = await handleEntriesPost(post("/api/manual-entries", body(1), { cookie: await login("Eva") }), deps);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "conflict", current: { revisionId: 2, author: "Jana" } });
  });

  it("rejects cross-origin writes and invalid data", async () => {
    const jana = await login();
    const valid = { clientId: crypto.randomUUID(), precinctNumber: 6042, action: "save", listVotes: votes, basedOnRevision: null };
    expect((await handleEntriesPost(post("/api/manual-entries", valid, { cookie: jana, origin: "https://evil.example" }), deps)).status).toBe(403);
    expect((await handleEntriesPost(post("/api/manual-entries", { ...valid, precinctNumber: 6200 }, { cookie: jana }), deps)).status).toBe(400);
    expect((await handleEntriesPost(post("/api/manual-entries", { ...valid, listVotes: [1, 2] }, { cookie: jana }), deps)).status).toBe(400);
    expect((await handleEntriesPost(post("/api/manual-entries", { ...valid, listVotes: votes.map(() => -1) }, { cookie: jana }), deps)).status).toBe(400);
    expect((await handleEntriesPost(post("/api/manual-entries", { ...valid, action: "delete", basedOnRevision: null }, { cookie: jana }), deps)).status).toBe(400);
  });

  it("refuses to run a shared store without a password and says plainly when none is configured", async () => {
    const open = await handleEntriesGet(new Request(`${ORIGIN}/api/manual-entries`), { db, auth: { kind: "disabled" } });
    expect(open.status).toBe(500);
    const local = await handleEntriesGet(new Request(`${ORIGIN}/api/manual-entries`), { db: null, auth: { kind: "disabled" } });
    expect(await local.json()).toMatchObject({ mode: "local_only" });
    expect(await (await handleSessionGet(new Request(`${ORIGIN}/api/session`), { db: null, auth: { kind: "disabled" } })).json()).toMatchObject({ required: false });
  });
});
