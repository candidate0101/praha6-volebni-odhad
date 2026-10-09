import { describe, expect, it } from "vitest";
import { validateSubmission } from "./precinct-submission";

describe("validateSubmission", () => {
  it("accepts one complete new precinct result and derives valid votes", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(["6002"]),
    })).toEqual({ ok: true, validVotes: 110 });
  });

  it("rejects duplicate precincts rather than overwriting them", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(["6001"]),
    })).toEqual({ ok: false, error: "Okrsek 6001 už má záznam; vytvořte revizi." });
  });

  it("allows the currently edited precinct to be saved again", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(["6001"]),
      editingPrecinct: "6001",
    })).toEqual({ ok: true, validVotes: 110 });
  });

  it("rejects a non-integer party vote before deriving the total", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0.5],
      expectedLists: 11,
      existingPrecincts: new Set(),
    })).toEqual({ ok: false, error: "Zadejte přesně 11 nezáporných celých hodnot." });
  });
});
