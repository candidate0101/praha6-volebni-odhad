import { describe, expect, it } from "vitest";
import { computeForecast } from "./forecast";

const LIST_IDS = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10", "l11"];

describe("computeForecast", () => {
  it("returns null before any precinct is entered", () => {
    expect(computeForecast(LIST_IDS, [], 45)).toBeNull();
  });

  it("computes total votes only from entered + projected data, never a fixed constant", () => {
    const entered = [{ number: 6001, validVotes: 2000, listVotes: [300, 0, 100, 400, 100, 200, 400, 200, 200, 50, 50] }];
    const forecast = computeForecast(LIST_IDS, entered, 45);
    expect(forecast).not.toBeNull();
    expect(forecast!.finalValidVotes).toBeGreaterThan(entered[0].validVotes);
    expect(forecast!.remainingPrecincts).toBe(103);
    const totalPointVotes = forecast!.lists.reduce((sum, list) => sum + list.pointVotes, 0);
    expect(totalPointVotes).toBeCloseTo(forecast!.finalValidVotes, 0);
  });

  it("narrows the share interval as more precincts are entered", () => {
    const onePrecinct = [{ number: 6001, validVotes: 2000, listVotes: [300, 0, 100, 400, 100, 200, 400, 200, 200, 50, 50] }];
    const manyPrecincts = [6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008].map((number) => ({
      number,
      validVotes: 2000,
      listVotes: [300, 0, 100, 400, 100, 200, 400, 200, 200, 50, 50],
    }));
    const oneForecast = computeForecast(LIST_IDS, onePrecinct, 45)!;
    const manyForecast = computeForecast(LIST_IDS, manyPrecincts, 45)!;
    const oneSpread = oneForecast.lists[3].p90Share - oneForecast.lists[3].p10Share;
    const manySpread = manyForecast.lists[3].p90Share - manyForecast.lists[3].p10Share;
    expect(manySpread).toBeLessThanOrEqual(oneSpread);
  });

  it("marks lists without a historical crosswalk as such", () => {
    const entered = [{ number: 6001, validVotes: 2000, listVotes: [300, 0, 100, 400, 100, 200, 400, 200, 200, 50, 50] }];
    const forecast = computeForecast(LIST_IDS, entered, 45)!;
    const noHistoryList = forecast.lists.find((list) => list.id === "l2");
    expect(noHistoryList?.hasHistory).toBe(false);
    const historyList = forecast.lists.find((list) => list.id === "l4");
    expect(historyList?.hasHistory).toBe(true);
  });

  it("keeps total projected seats equal to the seat count", () => {
    const entered = [{ number: 6001, validVotes: 2000, listVotes: [300, 0, 100, 400, 100, 200, 400, 200, 200, 50, 50] }];
    const forecast = computeForecast(LIST_IDS, entered, 45)!;
    const totalSeats = forecast.lists.reduce((sum, list) => sum + list.pointSeats, 0);
    expect(totalSeats).toBe(45);
  });
});
