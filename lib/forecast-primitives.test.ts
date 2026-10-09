import { describe, expect, it } from "vitest";
import { assessForecastConfidence, recentHistoricalShare, weightedMean } from "./forecast-primitives";

describe("recentHistoricalShare", () => {
  it("uses the 2022 precinct result when it is comparable", () => {
    expect(recentHistoricalShare({ v2022: 40, v2018: 10 }, 200, 100)).toBe(0.2);
  });

  it("falls back to 2018 only when no comparable 2022 result exists", () => {
    expect(recentHistoricalShare({ v2022: null, v2018: 10 }, 200, 100)).toBe(0.1);
  });

  it("gives larger precincts more influence without letting them dominate linearly", () => {
    expect(weightedMean([{ value: 0.1, weight: 1 }, { value: 0.5, weight: 3 }])).toBeCloseTo(0.4);
  });

  it("refuses a high-confidence label when reported precincts are not historically representative", () => {
    expect(assessForecastConfidence({ enteredCount: 30, coverageShare: 0.3, representativenessGap: 0.08 })).toBe("nízká");
    expect(assessForecastConfidence({ enteredCount: 30, coverageShare: 0.3, representativenessGap: 0.01 })).toBe("vyšší");
  });
});
