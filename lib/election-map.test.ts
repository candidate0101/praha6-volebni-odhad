import { describe, expect, it } from "vitest";
import { leaderColour, leadingListId, precinctAppearance, UNREPORTED_COLOUR } from "./election-map";

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
