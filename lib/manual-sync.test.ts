import { describe, expect, it } from "vitest";
import type { ManualChange, ManualEntry } from "./manual-entries";
import { confirmChange, enqueueChange, legacyUploads, mergeEntries, parseOutbox } from "./manual-sync";

const votes = (first: number) => [first, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const server: ManualEntry[] = [{ number: 6001, validVotes: 5, listVotes: votes(5), revisionId: 7, author: "Jana", updatedAt: "2026-10-10T13:00:00.000Z" }];
const change = (overrides: Partial<ManualChange>): ManualChange => ({ clientId: crypto.randomUUID(), precinctNumber: 6002, action: "save", listVotes: votes(3), basedOnRevision: null, ...overrides });

describe("manual entries outbox", () => {
  it("shows unsent changes on top of the shared state, marked as pending", () => {
    const outbox = enqueueChange(enqueueChange([], change({}), "t1"), change({ precinctNumber: 6001, action: "delete", listVotes: null, basedOnRevision: 7 }), "t2");
    expect(mergeEntries(server, outbox)).toEqual([{ number: 6002, listVotes: votes(3), validVotes: 3, revisionId: null, author: null, updatedAt: null, pending: true }]);
  });

  it("keeps the originally seen base revision when an unsent edit is edited again", () => {
    const first = enqueueChange([], change({ precinctNumber: 6001, listVotes: votes(6), basedOnRevision: 7 }), "t1");
    const second = enqueueChange(first, change({ precinctNumber: 6001, listVotes: votes(8), basedOnRevision: 99 }), "t2");
    expect(second).toHaveLength(1);
    expect(second[0].change).toMatchObject({ listVotes: votes(8), basedOnRevision: 7 });
    expect(second[0].change.clientId).not.toBe(first[0].change.clientId);
  });

  it("drops a brand-new precinct that is deleted before it was ever sent", () => {
    expect(enqueueChange(enqueueChange([], change({}), "t1"), change({ action: "delete", listVotes: null, basedOnRevision: null }), "t2")).toEqual([]);
  });

  it("offers only browser-only entries the server does not have yet", () => {
    const uploads = legacyUploads([{ number: 6001, listVotes: votes(1) }, { number: 6003, listVotes: votes(2) }], server, [], () => "id");
    expect(uploads).toEqual([{ clientId: "id", precinctNumber: 6003, action: "save", listVotes: votes(2), basedOnRevision: null }]);
  });

  it("shows a confirmed change immediately so it never disappears before the next poll", () => {
    const confirmed = confirmChange(server, change({ precinctNumber: 6050, listVotes: votes(9) }), 34);
    expect(mergeEntries(confirmed, []).map((entry) => [entry.number, entry.revisionId, entry.pending])).toEqual([[6001, 7, false], [6050, 34, false]]);
    expect(confirmChange(server, change({ precinctNumber: 6001, action: "delete", listVotes: null, basedOnRevision: 7 }), 8)).toEqual([]);
  });

  it("ignores a corrupted outbox instead of crashing", () => {
    expect(parseOutbox("{not json")).toEqual([]);
    expect(parseOutbox(JSON.stringify([{ nope: 1 }]))).toEqual([]);
  });
});
