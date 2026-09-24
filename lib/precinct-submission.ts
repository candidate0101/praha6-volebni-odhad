export type PrecinctSubmission = {
  precinctNumber: string;
  validVotes: number;
  listVotes: number[];
  expectedLists: number;
  existingPrecincts: ReadonlySet<string>;
};

type Validation = { ok: true } | { ok: false; error: string };

export function validateSubmission(input: PrecinctSubmission): Validation {
  const precinct = input.precinctNumber.trim();
  if (!/^\d+$/.test(precinct)) {
    return { ok: false, error: "Zadejte číslo okrsku." };
  }
  if (input.existingPrecincts.has(precinct)) {
    return { ok: false, error: `Okrsek ${precinct} už má záznam; vytvořte revizi.` };
  }
  if (!Number.isInteger(input.validVotes) || input.validVotes < 0) {
    return { ok: false, error: "Počet platných hlasů musí být nezáporné celé číslo." };
  }
  if (input.listVotes.length !== input.expectedLists || input.listVotes.some((vote) => !Number.isInteger(vote) || vote < 0)) {
    return { ok: false, error: `Zadejte přesně ${input.expectedLists} nezáporných celých hodnot.` };
  }
  const total = input.listVotes.reduce((sum, vote) => sum + vote, 0);
  if (total !== input.validVotes) {
    return { ok: false, error: `Součet hlasů pro listiny musí být ${input.validVotes}, je ${total}.` };
  }
  return { ok: true };
}
