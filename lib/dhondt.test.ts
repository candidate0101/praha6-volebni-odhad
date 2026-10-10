import { describe, expect, it } from "vitest";
import { allocateDhondt, allocateMunicipalMandates, type VoteRow } from "./dhondt";

const rows = (votes: number[]): VoteRow[] => votes.map((value, index) => ({
  id: `l${index + 1}`,
  label: `Listina ${index + 1}`,
  votes: value,
  colour: "",
}));

describe("allocateMunicipalMandates", () => {
  it("gives a below-five-percent list zero seats even when raw D'Hondt would award one", () => {
    const input = rows([951, 49]);

    expect(allocateDhondt(input, 45)[1].seats).toBeGreaterThan(0);
    const result = allocateMunicipalMandates(input, 45);
    expect(result[1]).toMatchObject({ qualified: false, seats: 0, share: 4.9 });
  });

  it("qualifies a list at exactly five percent", () => {
    const result = allocateMunicipalMandates(rows([950, 50]), 45);

    expect(result[1].qualified).toBe(true);
    expect(result[1].seats).toBeGreaterThan(0);
  });

  it("allocates all 45 seats among qualified lists while retaining full-total shares", () => {
    const result = allocateMunicipalMandates(rows([600, 351, 49]), 45);

    expect(result.reduce((sum, row) => sum + row.seats, 0)).toBe(45);
    expect(result.filter((row) => !row.qualified).every((row) => row.seats === 0)).toBe(true);
    expect(result[2].share).toBe(4.9);
  });
});
