import { allocateDhondt } from "./dhondt";

export type SeatInterval = { id: string; pointSeats: number; lowSeats: number; highSeats: number };

type Input = {
  listIds: string[];
  pointVotes: number[];
  shareSigmas: number[];
  totalVotes: number;
  seatCount: number;
  runs: number;
  seed: number;
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normal(next: () => number): number {
  const u = Math.max(next(), 1e-12);
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

export function simulateSeatIntervals(input: Input): SeatInterval[] {
  const next = random(input.seed);
  const pointSeats = allocateDhondt(input.listIds.map((id, index) => ({ id, label: id, votes: input.pointVotes[index], colour: "" })), input.seatCount).map((row) => row.seats);
  const seatRuns = input.listIds.map(() => [] as number[]);
  const pointShares = input.pointVotes.map((votes) => input.totalVotes > 0 ? votes / input.totalVotes : 0);
  for (let run = 0; run < input.runs; run += 1) {
    const raw = pointShares.map((share, index) => Math.max(0, share + normal(next) * input.shareSigmas[index]));
    const rawTotal = raw.reduce((sum, share) => sum + share, 0) || 1;
    const allocation = allocateDhondt(input.listIds.map((id, index) => ({ id, label: id, votes: raw[index] / rawTotal * input.totalVotes, colour: "" })), input.seatCount);
    allocation.forEach((row, index) => seatRuns[index].push(row.seats));
  }
  return input.listIds.map((id, index) => ({
    id,
    pointSeats: pointSeats[index],
    lowSeats: quantile(seatRuns[index], 0.1),
    highSeats: quantile(seatRuns[index], 0.9),
  }));
}
