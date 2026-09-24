import type { VoteRow } from "./dhondt";
import { allocateDhondt } from "./dhondt";
import forecastBasis from "../data/normalized/forecast-basis-2026.json";

type BasisPrecinct = {
  number: number;
  validVotes2022: number;
  validVotes2018: number;
  byList: Record<string, { v2022: number | null; v2018: number | null }>;
};

type Basis = { precincts: BasisPrecinct[] };

const basis = forecastBasis as Basis;
const basisByNumber = new Map(basis.precincts.map((p) => [p.number, p]));

const RECENT_WEIGHT = 0.65;
const OLDER_WEIGHT = 0.35;
const SHRINKAGE_K = 6;
const Z_80 = 1.2816;
const PRIOR_SWING_SIGMA = 0.05;

export type EnteredPrecinct = { number: number; validVotes: number; listVotes: number[] };

export type ForecastListResult = {
  id: string;
  pointVotes: number;
  pointShare: number;
  p10Share: number;
  p90Share: number;
  pointSeats: number;
  lowSeats: number;
  highSeats: number;
  hasHistory: boolean;
};

export type ForecastResult = {
  finalValidVotes: number;
  remainingPrecincts: number;
  confidenceLabel: "nízká" | "střední" | "vyšší";
  lists: ForecastListResult[];
};

function blendedShare(list: { v2022: number | null; v2018: number | null }, validVotes2022: number, validVotes2018: number): number | null {
  const share2022 = list.v2022 !== null && validVotes2022 > 0 ? list.v2022 / validVotes2022 : null;
  const share2018 = list.v2018 !== null && validVotes2018 > 0 ? list.v2018 / validVotes2018 : null;
  if (share2022 === null && share2018 === null) return null;
  if (share2022 === null) return share2018;
  if (share2018 === null) return share2022;
  return RECENT_WEIGHT * share2022 + OLDER_WEIGHT * share2018;
}

function blendedValidVotes(precinct: BasisPrecinct): number {
  return RECENT_WEIGHT * precinct.validVotes2022 + OLDER_WEIGHT * precinct.validVotes2018;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values: number[], meanValue: number): number {
  if (values.length < 2) return PRIOR_SWING_SIGMA * PRIOR_SWING_SIGMA;
  const sumSq = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0);
  return sumSq / (values.length - 1);
}

/**
 * Statistical "crystal ball": projects the final Praha 6 result from
 * entered precincts plus each remaining precinct's own 2018/2022
 * history, shrunk by how many precincts have actually reported.
 * This is a deterministic variance approximation, not a full
 * Monte Carlo simulation — the interval widens with fewer entered
 * precincts and narrows as coverage grows.
 */
export function computeForecast(listIds: string[], entered: EnteredPrecinct[], seatCount: number): ForecastResult | null {
  if (entered.length === 0) return null;

  const enteredCount = entered.length;
  const shrink = enteredCount / (enteredCount + SHRINKAGE_K);
  const enteredNumbers = new Set(entered.map((p) => p.number));
  const remaining = basis.precincts.filter((p) => !enteredNumbers.has(p.number));

  const enteredValidVotesTotal = entered.reduce((sum, p) => sum + p.validVotes, 0);
  const enteredBaselineValidVotesTotal = entered.reduce((sum, p) => {
    const basisPrecinct = basisByNumber.get(p.number);
    return sum + (basisPrecinct ? blendedValidVotes(basisPrecinct) : p.validVotes);
  }, 0);
  const rawTurnoutRatio = enteredBaselineValidVotesTotal > 0 ? enteredValidVotesTotal / enteredBaselineValidVotesTotal : 1;
  const appliedTurnoutRatio = 1 + (rawTurnoutRatio - 1) * shrink;

  const perListSwings: Record<string, number[]> = {};
  const perListNoHistoryShares: Record<string, number[]> = {};
  for (const listId of listIds) {
    perListSwings[listId] = [];
    perListNoHistoryShares[listId] = [];
  }

  for (const p of entered) {
    const basisPrecinct = basisByNumber.get(p.number);
    if (!basisPrecinct || p.validVotes <= 0) continue;
    listIds.forEach((listId, index) => {
      const actualShare = p.listVotes[index] / p.validVotes;
      const historyShare = blendedShare(basisPrecinct.byList[listId], basisPrecinct.validVotes2022, basisPrecinct.validVotes2018);
      if (historyShare === null) {
        perListNoHistoryShares[listId].push(actualShare);
      } else {
        perListSwings[listId].push(actualShare - historyShare);
      }
    });
  }

  const actualVotesByList = listIds.map((_, index) => entered.reduce((sum, p) => sum + p.listVotes[index], 0));

  const expectedRemainingVotes = listIds.map(() => 0);
  const expectedRemainingLow = listIds.map(() => 0);
  const expectedRemainingHigh = listIds.map(() => 0);
  let remainingValidVotesTotal = 0;

  const meanSwingByList = listIds.map((listId) => mean(perListSwings[listId]));
  const sigmaByList = listIds.map((listId, index) => Math.sqrt(variance(perListSwings[listId], meanSwingByList[index])) / Math.sqrt(Math.max(1, enteredCount)));
  const meanNoHistoryShareByList = listIds.map((listId) => mean(perListNoHistoryShares[listId]));

  for (const p of remaining) {
    const expectedValid = blendedValidVotes(p) * appliedTurnoutRatio;
    remainingValidVotesTotal += expectedValid;
    const rawShares = listIds.map((listId, index) => {
      const historyShare = blendedShare(p.byList[listId], p.validVotes2022, p.validVotes2018);
      if (historyShare === null) {
        const prior = 1 / listIds.length;
        return prior + (meanNoHistoryShareByList[index] - prior) * shrink;
      }
      return Math.max(0, historyShare + meanSwingByList[index] * shrink);
    });
    const rawTotal = rawShares.reduce((sum, share) => sum + share, 0) || 1;
    rawShares.forEach((share, index) => {
      const normalizedShare = share / rawTotal;
      expectedRemainingVotes[index] += normalizedShare * expectedValid;
      expectedRemainingLow[index] += Math.max(0, normalizedShare - Z_80 * sigmaByList[index]) * expectedValid;
      expectedRemainingHigh[index] += Math.min(1, normalizedShare + Z_80 * sigmaByList[index]) * expectedValid;
    });
  }

  const pointVotesByList = listIds.map((_, index) => actualVotesByList[index] + expectedRemainingVotes[index]);
  const lowVotesByList = listIds.map((_, index) => actualVotesByList[index] + expectedRemainingLow[index]);
  const highVotesByList = listIds.map((_, index) => actualVotesByList[index] + expectedRemainingHigh[index]);
  const finalValidVotes = enteredValidVotesTotal + remainingValidVotesTotal;

  const rowsFor = (votes: number[]): VoteRow[] => listIds.map((id, index) => ({ id, label: id, votes: votes[index], colour: "" }));
  const pointSeats = allocateDhondt(rowsFor(pointVotesByList), seatCount);
  const lowSeats = allocateDhondt(rowsFor(lowVotesByList), seatCount);
  const highSeats = allocateDhondt(rowsFor(highVotesByList), seatCount);

  const confidenceLabel: ForecastResult["confidenceLabel"] = enteredCount < 5 ? "nízká" : enteredCount < 25 ? "střední" : "vyšší";

  const lists: ForecastListResult[] = listIds.map((id, index) => {
    const hasHistory = perListSwings[id].length > 0;
    return {
      id,
      pointVotes: pointVotesByList[index],
      pointShare: finalValidVotes > 0 ? (pointVotesByList[index] / finalValidVotes) * 100 : 0,
      p10Share: finalValidVotes > 0 ? (lowVotesByList[index] / finalValidVotes) * 100 : 0,
      p90Share: finalValidVotes > 0 ? (highVotesByList[index] / finalValidVotes) * 100 : 0,
      pointSeats: pointSeats[index].seats,
      lowSeats: Math.min(lowSeats[index].seats, highSeats[index].seats),
      highSeats: Math.max(lowSeats[index].seats, highSeats[index].seats),
      hasHistory,
    };
  });

  return { finalValidVotes, remainingPrecincts: remaining.length, confidenceLabel, lists };
}
