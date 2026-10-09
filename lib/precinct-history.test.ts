import { describe, expect, it } from "vitest";
import { currentPrecinctResult, historicalPrecinctResult, HISTORY_YEARS } from "./precinct-history";

describe("precinct results for the map detail", () => {
  it("offers the two previous municipal elections, newest first", () => {
    expect(HISTORY_YEARS).toEqual([2022, 2018]);
  });

  it("returns the official 2022 result of a precinct sorted by votes, with shares of valid votes", () => {
    const result = historicalPrecinctResult(2022, "6001");
    expect(result?.validVotes).toBe(12166);
    expect(result?.turnoutPercent).toBe(43.34);
    expect(result?.rows).toHaveLength(10);
    expect(result?.rows[0]).toMatchObject({ label: "STAN s podporou Zelených", short: "Zelení+STAN", votes: 2493 });
    expect(result?.rows[0].share).toBeCloseTo(20.49, 2);
    expect(result?.rows.map((row) => row.votes)).toEqual([...result!.rows.map((row) => row.votes)].sort((a, b) => b - a));
    expect(result?.rows.reduce((sum, row) => sum + row.votes, 0)).toBe(12166);
  });

  it("returns the 2018 result under the lists that ran in 2018, not today's lists", () => {
    const result = historicalPrecinctResult(2018, 6001);
    expect(result?.rows).toHaveLength(11);
    expect(result?.rows.some((row) => row.label === "GEN")).toBe(false);
  });

  it("has no result for an unknown precinct", () => {
    expect(historicalPrecinctResult(2022, "9999")).toBeNull();
  });

  it("turns a current entry into sorted rows with the list colours and no turnout", () => {
    const lists = [
      { id: "l1", label: "A", colour: "#111111" },
      { id: "l2", label: "B", colour: "#222222" },
      { id: "l3", label: "C", colour: "#333333" },
    ];
    const result = currentPrecinctResult({ validVotes: 400, listVotes: [100, 300, 0] }, lists);
    expect(result.turnoutPercent).toBeNull();
    expect(result.rows.map((row) => [row.label, row.share, row.colour])).toEqual([["B", 75, "#222222"], ["A", 25, "#111111"], ["C", 0, "#333333"]]);
  });

  it("keeps shares at zero instead of dividing by zero for an empty entry", () => {
    const result = currentPrecinctResult({ validVotes: 0, listVotes: [0, 0] }, [{ id: "l1", label: "A", colour: "#1" }, { id: "l2", label: "B", colour: "#2" }]);
    expect(result.rows.every((row) => row.share === 0)).toBe(true);
  });
});
