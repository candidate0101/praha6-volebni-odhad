import { describe, expect, it } from "vitest";
import { validateSubmission } from "./precinct-submission";

describe("validateSubmission", () => {
  it("accepts one complete new precinct result", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      validVotes: 110,
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(["6002"]),
    })).toEqual({ ok: true });
  });

  it("rejects duplicate precincts rather than overwriting them", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      validVotes: 110,
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(["6001"]),
    })).toEqual({ ok: false, error: "Okrsek 6001 už má záznam; vytvořte revizi." });
  });

  it("rejects list votes that do not equal declared valid votes", () => {
    expect(validateSubmission({
      precinctNumber: "6001",
      validVotes: 111,
      listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      expectedLists: 11,
      existingPrecincts: new Set(),
    })).toEqual({ ok: false, error: "Součet hlasů pro listiny musí být 111, je 110." });
  });
});
