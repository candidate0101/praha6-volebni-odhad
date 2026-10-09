import { describe, expect, it } from "vitest";
import { allocateCouncilComposition, orderCandidatesByPreference } from "./council-composition";

const rows = [
  { id: "l1", label: "Listina A", votes: 5100, colour: "#111" },
  { id: "l2", label: "Listina B", votes: 4300, colour: "#222" },
  { id: "l3", label: "Listina C", votes: 400, colour: "#333" },
];

describe("council composition", () => {
  it("allocates all 45 seats only among lists at or above the five-percent clause", () => {
    const result = allocateCouncilComposition(rows, 45, 0.05);

    expect(result.reduce((sum, row) => sum + row.seats, 0)).toBe(45);
    expect(result.find((row) => row.id === "l3")?.seats).toBe(0);
    expect(result.find((row) => row.id === "l3")?.qualified).toBe(false);
  });

  it("keeps ballot order without preference votes and promotes only candidates reaching ten percent of list votes", () => {
    const candidates = [
      { listId: "l1", ballotOrder: 1, name: "První" },
      { listId: "l1", ballotOrder: 2, name: "Druhá" },
      { listId: "l1", ballotOrder: 3, name: "Třetí" },
    ];

    expect(orderCandidatesByPreference(candidates, 5100, [])).toEqual(candidates);
    expect(orderCandidatesByPreference(candidates, 5100, [
      { listId: "l1", ballotOrder: 3, votes: 550 },
      { listId: "l1", ballotOrder: 2, votes: 500 },
    ]).map((candidate) => candidate.name)).toEqual(["Třetí", "První", "Druhá"]);
  });
});
