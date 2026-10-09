export type PrecinctSubmission = {
  precinctNumber: string;
  listVotes: number[];
  expectedLists: number;
  existingPrecincts: ReadonlySet<string>;
  editingPrecinct?: string;
};

type Validation = { ok: true; validVotes: number } | { ok: false; error: string };

export function validateSubmission(input: PrecinctSubmission): Validation {
  const precinct = input.precinctNumber.trim();
  if (!/^\d+$/.test(precinct)) {
    return { ok: false, error: "Zadejte číslo okrsku." };
  }
  if (input.existingPrecincts.has(precinct) && input.editingPrecinct !== precinct) {
    return { ok: false, error: `Okrsek ${precinct} už má záznam; vytvořte revizi.` };
  }
  if (input.listVotes.length !== input.expectedLists || input.listVotes.some((vote) => !Number.isInteger(vote) || vote < 0)) {
    return { ok: false, error: `Zadejte přesně ${input.expectedLists} nezáporných celých hodnot.` };
  }
  return { ok: true, validVotes: input.listVotes.reduce((sum, vote) => sum + vote, 0) };
}
