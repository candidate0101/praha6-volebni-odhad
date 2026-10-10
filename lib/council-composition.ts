import { allocateMunicipalMandates, MUNICIPAL_THRESHOLD, type QualifiedSeatResult, type VoteRow } from "./dhondt";

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

export type CouncilSeatResult = QualifiedSeatResult;

export function allocateCouncilComposition(rows: VoteRow[], seatCount = 45, clause = MUNICIPAL_THRESHOLD): CouncilSeatResult[] {
  return allocateMunicipalMandates(rows, seatCount, clause);
}

export function orderCandidatesByPreference(candidates: CouncilCandidate[], listVotes: number, preferenceVotes: CandidatePreferenceVote[]): CouncilCandidate[] {
  const votesByOrder = new Map(preferenceVotes.map((entry) => [entry.ballotOrder, entry.votes]));
  const threshold = listVotes * 0.1;
  const promoted = candidates.filter((candidate) => (votesByOrder.get(candidate.ballotOrder) ?? 0) >= threshold && threshold > 0);
  const remaining = candidates.filter((candidate) => !promoted.includes(candidate));
  return [...promoted.sort((left, right) => (votesByOrder.get(right.ballotOrder) ?? 0) - (votesByOrder.get(left.ballotOrder) ?? 0) || left.ballotOrder - right.ballotOrder), ...remaining];
}
