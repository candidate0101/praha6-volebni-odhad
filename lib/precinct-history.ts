import history from "../data/normalized/praha6-precinct-history.json";

// Official ČSÚ results of earlier municipal elections, per precinct, for the map detail.
// Precincts are paired by number; the lists are shown as they ran in that year (no crosswalk).

export type HistoryYear = 2022 | 2018;
export const HISTORY_YEARS: HistoryYear[] = [2022, 2018];

export type PrecinctResultRow = { label: string; short: string | null; votes: number; share: number; colour: string | null };
export type PrecinctResult = { validVotes: number; turnoutPercent: number | null; rows: PrecinctResultRow[] };

type Election = {
  year: number;
  lists: { ballotNumber: number; name: string; abbreviation: string }[];
  precincts: Record<string, { turnoutPercent: number; validVotes: number; listVotes: number[] }>;
};

const elections = (history as { elections: Election[] }).elections;

function sortRows(rows: (PrecinctResultRow & { order: number })[]): PrecinctResultRow[] {
  return rows.sort((left, right) => right.votes - left.votes || left.order - right.order).map(({ order: _order, ...row }) => row);
}

const shareOf = (votes: number, total: number) => (total > 0 ? (votes / total) * 100 : 0);

export function historicalPrecinctResult(year: HistoryYear, precinct: string | number): PrecinctResult | null {
  const election = elections.find((item) => item.year === year);
  const result = election?.precincts[String(precinct)];
  if (!election || !result) return null;
  return {
    validVotes: result.validVotes,
    turnoutPercent: result.turnoutPercent,
    rows: sortRows(election.lists.map((list, index) => ({
      label: list.name,
      short: list.abbreviation,
      votes: result.listVotes[index] ?? 0,
      share: shareOf(result.listVotes[index] ?? 0, result.validVotes),
      colour: null,
      order: index,
    }))),
  };
}

export function currentPrecinctResult(entry: { validVotes: number; listVotes: number[] }, lists: { id: string; label: string; colour: string }[]): PrecinctResult {
  return {
    validVotes: entry.validVotes,
    turnoutPercent: null,
    rows: sortRows(lists.map((list, index) => ({
      label: list.label,
      short: null,
      votes: entry.listVotes[index] ?? 0,
      share: shareOf(entry.listVotes[index] ?? 0, entry.validVotes),
      colour: list.colour,
      order: index,
    }))),
  };
}
