import { describe, expect, it } from "vitest";
import { historicalProfileType, pooledSwing } from "./precinct-typology";

describe("precinct typology", () => {
  it("assigns a historic type by the leading comparable list", () => {
    expect(historicalProfileType([0.22, 0.41, 0.15], ["l1", "l2", "l3"])).toBe("l2");
  });

  it("partially pools a local type swing with the citywide swing", () => {
    expect(pooledSwing(0.02, [0.1, 0.12])).toBeCloseTo(0.056);
    expect(pooledSwing(0.02, [])).toBe(0.02);
  });
});
