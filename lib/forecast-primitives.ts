export type HistoricalVotes = { v2022: number | null; v2018: number | null };

export function recentHistoricalShare(history: HistoricalVotes, validVotes2022: number, validVotes2018: number): number | null {
  if (history.v2022 !== null && validVotes2022 > 0) return history.v2022 / validVotes2022;
  if (history.v2018 !== null && validVotes2018 > 0) return history.v2018 / validVotes2018;
  return null;
}

export function weightedMean(observations: Array<{ value: number; weight: number }>): number {
  const weightTotal = observations.reduce((sum, observation) => sum + Math.max(0, observation.weight), 0);
  if (weightTotal === 0) return 0;
  return observations.reduce((sum, observation) => sum + observation.value * Math.max(0, observation.weight), 0) / weightTotal;
}

export type ForecastConfidence = "nízká" | "střední" | "vyšší";

export function assessForecastConfidence(input: { enteredCount: number; coverageShare: number; representativenessGap: number }): ForecastConfidence {
  if (input.enteredCount < 5 || input.coverageShare < 0.05 || input.representativenessGap > 0.06) return "nízká";
  if (input.enteredCount < 25 || input.coverageShare < 0.2 || input.representativenessGap > 0.03) return "střední";
  return "vyšší";
}

export function recentHistoricalValidVotes(validVotes2022: number, validVotes2018: number): number {
  return validVotes2022 > 0 ? validVotes2022 : validVotes2018;
}
