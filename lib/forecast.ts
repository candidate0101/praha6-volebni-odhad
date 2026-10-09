import type { VoteRow } from "./dhondt";
import { allocateDhondt } from "./dhondt";
import { simulateSeatIntervals } from "./forecast-simulation";
import { historicalProfileType, pooledSwing } from "./precinct-typology";
import { assessForecastConfidence, recentHistoricalShare, recentHistoricalValidVotes, type ForecastConfidence, weightedMean } from "./forecast-primitives";
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
  confidenceLabel: ForecastConfidence;
  coverageShare: number;
  representativenessGap: number;
  lists: ForecastListResult[];
};

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
    return sum + (basisPrecinct ? recentHistoricalValidVotes(basisPrecinct.validVotes2022, basisPrecinct.validVotes2018) : p.validVotes);
  }, 0);
  const rawTurnoutRatio = enteredBaselineValidVotesTotal > 0 ? enteredValidVotesTotal / enteredBaselineValidVotesTotal : 1;
  const appliedTurnoutRatio = 1 + (rawTurnoutRatio - 1) * shrink;

  const perListSwings: Record<string, number[]> = {};
  const perListSwingWeights: Record<string, number[]> = {};
  const perListNoHistoryShares: Record<string, number[]> = {};
  const perTypeSwings: Record<string, Record<string, number[]>> = {};
  for (const listId of listIds) {
    perListSwings[listId] = [];
    perListSwingWeights[listId] = [];
    perListNoHistoryShares[listId] = [];
  }

  for (const p of entered) {
    const basisPrecinct = basisByNumber.get(p.number);
    if (!basisPrecinct || p.validVotes <= 0) continue;
    const type = historicalProfileType(listIds.map((listId) => recentHistoricalShare(basisPrecinct.byList[listId], basisPrecinct.validVotes2022, basisPrecinct.validVotes2018)), listIds);
    perTypeSwings[type] ??= Object.fromEntries(listIds.map((listId) => [listId, []]));
    listIds.forEach((listId, index) => {
      const actualShare = p.listVotes[index] / p.validVotes;
      const historyShare = recentHistoricalShare(basisPrecinct.byList[listId], basisPrecinct.validVotes2022, basisPrecinct.validVotes2018);
      if (historyShare === null) {
        perListNoHistoryShares[listId].push(actualShare);
      } else {
        perListSwings[listId].push(actualShare - historyShare);
        perTypeSwings[type][listId].push(actualShare - historyShare);
        perListSwingWeights[listId].push(Math.sqrt(p.validVotes));
      }
    });
  }

  const actualVotesByList = listIds.map((_, index) => entered.reduce((sum, p) => sum + p.listVotes[index], 0));

  const expectedRemainingVotes = listIds.map(() => 0);
  const expectedRemainingLow = listIds.map(() => 0);
  const expectedRemainingHigh = listIds.map(() => 0);
  let remainingValidVotesTotal = 0;

  const meanSwingByList = listIds.map((listId) => weightedMean(perListSwings[listId].map((value, index) => ({ value, weight: perListSwingWeights[listId][index] }))));
  const sigmaByList = listIds.map((listId, index) => Math.sqrt(variance(perListSwings[listId], meanSwingByList[index])) / Math.sqrt(Math.max(1, enteredCount)));
  const meanNoHistoryShareByList = listIds.map((listId) => mean(perListNoHistoryShares[listId]));

  for (const p of remaining) {
    const expectedValid = recentHistoricalValidVotes(p.validVotes2022, p.validVotes2018) * appliedTurnoutRatio;
    remainingValidVotesTotal += expectedValid;
    const type = historicalProfileType(listIds.map((listId) => recentHistoricalShare(p.byList[listId], p.validVotes2022, p.validVotes2018)), listIds);
    const rawShares = listIds.map((listId, index) => {
      const historyShare = recentHistoricalShare(p.byList[listId], p.validVotes2022, p.validVotes2018);
      if (historyShare === null) {
        const prior = 1 / listIds.length;
        return prior + (meanNoHistoryShareByList[index] - prior) * shrink;
      }
      return Math.max(0, historyShare + pooledSwing(meanSwingByList[index], perTypeSwings[type]?.[listId] ?? []) * shrink);
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
  const simulatedSeatIntervals = simulateSeatIntervals({
    listIds,
    pointVotes: pointVotesByList,
    shareSigmas: sigmaByList,
    totalVotes: finalValidVotes,
    seatCount,
    runs: 1000,
    seed: 20261009,
  });
  const seatIntervalsById = new Map(simulatedSeatIntervals.map((result) => [result.id, result]));

  const coverageShare = finalValidVotes > 0 ? enteredValidVotesTotal / finalValidVotes : 0;
  const representativenessGaps = listIds.flatMap((listId) => {
    const population = basis.precincts.flatMap((precinct) => {
      const share = recentHistoricalShare(precinct.byList[listId], precinct.validVotes2022, precinct.validVotes2018);
      return share === null ? [] : [{ value: share, weight: Math.sqrt(recentHistoricalValidVotes(precinct.validVotes2022, precinct.validVotes2018)) }];
    });
    const reported = entered.flatMap((entry) => {
      const precinct = basisByNumber.get(entry.number);
      if (!precinct) return [];
      const share = recentHistoricalShare(precinct.byList[listId], precinct.validVotes2022, precinct.validVotes2018);
      return share === null ? [] : [{ value: share, weight: Math.sqrt(entry.validVotes) }];
    });
    return population.length && reported.length ? [Math.abs(weightedMean(population) - weightedMean(reported))] : [];
  });
  const representativenessGap = mean(representativenessGaps);
  const confidenceLabel = assessForecastConfidence({ enteredCount, coverageShare, representativenessGap });

  const lists: ForecastListResult[] = listIds.map((id, index) => {
    const hasHistory = perListSwings[id].length > 0;
    return {
      id,
      pointVotes: pointVotesByList[index],
      pointShare: finalValidVotes > 0 ? (pointVotesByList[index] / finalValidVotes) * 100 : 0,
      p10Share: finalValidVotes > 0 ? (lowVotesByList[index] / finalValidVotes) * 100 : 0,
      p90Share: finalValidVotes > 0 ? (highVotesByList[index] / finalValidVotes) * 100 : 0,
      pointSeats: pointSeats[index].seats,
      lowSeats: seatIntervalsById.get(id)?.lowSeats ?? pointSeats[index].seats,
      highSeats: seatIntervalsById.get(id)?.highSeats ?? pointSeats[index].seats,
      hasHistory,
    };
  });

  return { finalValidVotes, remainingPrecincts: remaining.length, confidenceLabel, coverageShare, representativenessGap, lists };
}
