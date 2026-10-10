import { describe, expect, it } from "vitest";
import { allocateDhondt, allocateMunicipalMandates, type VoteRow } from "./dhondt";

const rows = (votes: number[]): VoteRow[] => votes.map((value, index) => ({
  id: `l${index + 1}`,
  label: `Listina ${index + 1}`,
  votes: value,
  colour: "",
}));

describe("allocateMunicipalMandates", () => {
  it("assigns no mandate to lists below five percent even when raw D'Hondt would assign one", () => {
    const input = rows([951, 49]);

    expect(allocateDhondt(input, 45)[1].seats).toBeGreaterThan(0);
    const result = allocateMunicipalMandates(input, 45);
    expect(result[1]).toMatchObject({ qualified: false, seats: 0, share: 4.9 });
    expect(result.reduce((sum, row) => sum + row.seats, 0)).toBe(45);
  });

  it("includes a list at exactly five percent in D'Hondt allocation", () => {
    const result = allocateMunicipalMandates(rows([950, 50]), 45);

    expect(result[1].qualified).toBe(true);
    expect(result[1].seats).toBeGreaterThan(0);
  });

  it("uses the D'Hondt quotient sequence for eligible lists", () => {
    const result = allocateDhondt(rows([1000, 800, 600]), 5);

    expect(result.map((row) => row.seats)).toEqual([2, 2, 1]);
  });
});
