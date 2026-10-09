import { allocateDhondt, type SeatResult, type VoteRow } from "./dhondt";

export type CouncilCandidate = {
  listId: string;
  ballotOrder: number;
  name: string;
};

export type CandidatePreferenceVote = {
  listId: string;
  ballotOrder: number;
  votes: number;
};

export type CouncilSeatResult = SeatResult & { qualified: boolean };

export function allocateCouncilComposition(rows: VoteRow[], seatCount = 45, clause = 0.05): CouncilSeatResult[] {
  const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);
  const qualifiedIds = new Set(rows.filter((row) => totalVotes > 0 && row.votes / totalVotes >= clause).map((row) => row.id));
  const qualifiedResults = allocateDhondt(rows.filter((row) => qualifiedIds.has(row.id)), seatCount);
  const seatsById = new Map(qualifiedResults.map((row) => [row.id, row.seats]));
  return rows.map((row) => ({
    ...row,
    seats: seatsById.get(row.id) ?? 0,
    share: totalVotes ? row.votes / totalVotes * 100 : 0,
    qualified: qualifiedIds.has(row.id),
  }));
}

export function orderCandidatesByPreference(candidates: CouncilCandidate[], listVotes: number, preferenceVotes: CandidatePreferenceVote[]): CouncilCandidate[] {
  const votesByOrder = new Map(preferenceVotes.map((entry) => [entry.ballotOrder, entry.votes]));
  const threshold = listVotes * 0.1;
  const promoted = candidates.filter((candidate) => (votesByOrder.get(candidate.ballotOrder) ?? 0) >= threshold && threshold > 0);
  const remaining = candidates.filter((candidate) => !promoted.includes(candidate));
  return [...promoted.sort((left, right) => (votesByOrder.get(right.ballotOrder) ?? 0) - (votesByOrder.get(left.ballotOrder) ?? 0) || left.ballotOrder - right.ballotOrder), ...remaining];
}
