import { describe, expect, it } from "vitest";
import { leaderColour, leaderLegend, leadingListId, PROCESSED_STATUS_COLOUR, precinctAppearance, summarizeMap, UNREPORTED_COLOUR } from "./election-map";

describe("election map colouring", () => {
  it("uses the agreed blue for an ODS and KDU-ČSL precinct win", () => {
    expect(leaderColour("l7")).toBe("#2563eb");
  });

  it("uses the agreed colours for the named parties", () => {
    expect(leaderColour("l6")).toBe("#f4c542");
    expect(leaderColour("l1")).toBe("#ec4899");
    expect(leaderColour("l4")).toBe("#1f2937");
    expect(leaderColour("l8")).toBe("#65a30d");
    expect(leaderColour("l9")).toBe("#f97316");
  });

  it("keeps an unreported or tied precinct neutral", () => {
    expect(leadingListId([0, 0, 0])).toBeNull();
    expect(leadingListId([20, 20, 10])).toBeNull();
  });

  it("identifies a clear precinct winner by its list position", () => {
    expect(leadingListId([12, 40, 15])).toBe("l2");
  });
});

describe("precinct appearance on the map", () => {
  it("keeps unreported and tied precincts neutral and says so in text", () => {
    expect(precinctAppearance(undefined)).toMatchObject({ fill: UNREPORTED_COLOUR, pattern: null, label: "bez výsledku" });
    expect(precinctAppearance({ listVotes: [5, 5, 0] })).toMatchObject({ fill: UNREPORTED_COLOUR, label: "shoda na prvním místě" });
  });

  it("uses the leading list's own colour, never a system accent", () => {
    expect(precinctAppearance({ listVotes: [0, 0, 0, 0, 0, 0, 30, 10] })).toMatchObject({ fill: "#2563eb", leaderId: "l7", pattern: null });
  });

  it("marks a discrepancy with a hatch pattern and a text label, not by colour alone", () => {
    expect(precinctAppearance(undefined, "discrepancy")).toMatchObject({ fill: UNREPORTED_COLOUR, pattern: "hatch", label: "rozpor k ověření" });
  });

  it("marks an unsent manual entry with a dotted outline but keeps its leader colour", () => {
    expect(precinctAppearance({ listVotes: [9, 1] }, "pending")).toMatchObject({ fill: "#ec4899", pattern: "dots", label: expect.stringContaining("neodesláno") });
  });
});

describe("map states that never rely on colour alone", () => {
  it("gives an unreported precinct a dashed outline and a processed one a solid outline", () => {
    expect(precinctAppearance(undefined)).toMatchObject({ state: "unreported", outline: "dashed" });
    expect(precinctAppearance({ listVotes: [5, 5, 0] })).toMatchObject({ state: "tie", outline: "solid" });
    expect(precinctAppearance({ listVotes: [9, 1] })).toMatchObject({ state: "leader", outline: "solid" });
    expect(precinctAppearance(undefined, "discrepancy")).toMatchObject({ state: "discrepancy", outline: "solid" });
    expect(precinctAppearance({ listVotes: [9, 1] }, "pending")).toMatchObject({ state: "pending" });
  });

  it("the processing view shows state only, never a party colour", () => {
    const leader = precinctAppearance({ listVotes: [0, 0, 0, 0, 0, 0, 30, 10] }, undefined, "status");
    expect(leader).toMatchObject({ fill: PROCESSED_STATUS_COLOUR, leaderId: "l7", pattern: null, state: "leader" });
    expect(precinctAppearance({ listVotes: [9, 1] }, "pending", "status")).toMatchObject({ fill: PROCESSED_STATUS_COLOUR, pattern: "dots" });
    expect(precinctAppearance(undefined, "discrepancy", "status")).toMatchObject({ fill: UNREPORTED_COLOUR, pattern: "hatch" });
    expect(precinctAppearance(undefined, undefined, "status")).toMatchObject({ fill: UNREPORTED_COLOUR, outline: "dashed" });
  });
});

describe("map summary and legend", () => {
  const entries = [
    { number: 6001, listVotes: [10, 2] },
    { number: 6002, listVotes: [1, 8] },
    { number: 6003, listVotes: [9, 3] },
    { number: 6004, listVotes: [4, 4] },
  ];

  it("counts processed, unreported, discrepancy and unsent precincts out of the total", () => {
    const flags = new Map([[6003, "pending" as const], [6050, "discrepancy" as const]]);
    expect(summarizeMap(entries, flags, 104)).toEqual({ processed: 4, unreported: 99, discrepancy: 1, pending: 1 });
    expect(summarizeMap([], new Map(), 104)).toEqual({ processed: 0, unreported: 104, discrepancy: 0, pending: 0 });
  });

  it("lists only the lists that lead somewhere, most precincts first", () => {
    expect(leaderLegend(entries, new Map())).toEqual([
      { id: "l1", colour: leaderColour("l1"), count: 2 },
      { id: "l2", colour: leaderColour("l2"), count: 1 },
    ]);
  });

  it("leaves precincts under discrepancy out of the leader legend", () => {
    expect(leaderLegend(entries, new Map([[6002, "discrepancy" as const]]))).toEqual([{ id: "l1", colour: leaderColour("l1"), count: 2 }]);
  });
});
