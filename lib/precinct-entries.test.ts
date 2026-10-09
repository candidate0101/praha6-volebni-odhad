import { describe, expect, it } from "vitest";
import { removePrecinctEntry, savePrecinctEntry } from "./precinct-entries";

describe("savePrecinctEntry", () => {
  it("replaces an existing precinct instead of creating a duplicate when editing", () => {
    const current = [
      { number: 6001, validVotes: 110, listVotes: [10, 20] },
      { number: 6002, validVotes: 70, listVotes: [30, 40] },
    ];

    expect(savePrecinctEntry(current, { number: 6001, validVotes: 130, listVotes: [50, 80] })).toEqual([
      { number: 6001, validVotes: 130, listVotes: [50, 80] },
      { number: 6002, validVotes: 70, listVotes: [30, 40] },
    ]);
  });

  it("adds a new precinct when no existing entry has that number", () => {
    expect(savePrecinctEntry([], { number: 6001, validVotes: 110, listVotes: [10, 100] })).toEqual([
      { number: 6001, validVotes: 110, listVotes: [10, 100] },
    ]);
  });

  it("removes exactly the selected filled precinct", () => {
    const current = [
      { number: 6001, validVotes: 110, listVotes: [10, 20] },
      { number: 6002, validVotes: 70, listVotes: [30, 40] },
    ];

    expect(removePrecinctEntry(current, 6001)).toEqual([
      { number: 6002, validVotes: 70, listVotes: [30, 40] },
    ]);
  });
});
