import { describe, expect, it } from "vitest";
import { parseStoredEntries, serializeEntries } from "./entry-persistence";

describe("entry persistence", () => {
  it("round-trips valid precinct entries for browser storage", () => {
    const entries = [{ number: 6001, validVotes: 110, listVotes: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] }];

    expect(parseStoredEntries(serializeEntries(entries))).toEqual(entries);
  });

  it("ignores malformed browser storage rather than trusting it", () => {
    expect(parseStoredEntries('{"number":"not a precinct"}')).toEqual([]);
  });
});
