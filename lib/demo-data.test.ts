import { describe, expect, it } from "vitest";
import { initialVoteRows } from "./demo-data";
import { leaderColour } from "./election-map";

describe("dashboard party colours", () => {
  it("uses the map palette for every registered 2026 list", () => {
    expect(initialVoteRows).toHaveLength(11);
    for (const row of initialVoteRows) {
      expect(row.colour).toBe(leaderColour(row.id));
    }
  });
});