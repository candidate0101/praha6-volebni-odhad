import { describe, expect, it } from "vitest";
import { simulateSeatIntervals } from "./forecast-simulation";

describe("simulateSeatIntervals", () => {
  it("uses correlated compositional draws that preserve the fixed council size", () => {
    const intervals = simulateSeatIntervals({
      listIds: ["a", "b", "c"],
      pointVotes: [500, 300, 200],
      shareSigmas: [0.04, 0.03, 0.02],
      totalVotes: 1000,
      seatCount: 45,
      runs: 200,
      seed: 7,
    });
    expect(intervals).toHaveLength(3);
    expect(intervals.reduce((sum, item) => sum + item.pointSeats, 0)).toBe(45);
    expect(intervals.every((item) => item.lowSeats <= item.highSeats)).toBe(true);
  });
});
