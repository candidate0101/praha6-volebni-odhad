import { describe, expect, it } from "vitest";
import { ageLabel, latestIso } from "./data-status";

describe("freshness of the data shown on a page", () => {
  it("picks the newest timestamp and ignores missing ones", () => {
    expect(latestIso(["2026-10-09T18:00:00.000Z", null, "2026-10-09T18:05:00.000Z", undefined, "2026-10-09T17:59:00.000Z"])).toBe("2026-10-09T18:05:00.000Z");
    expect(latestIso([null, undefined])).toBeNull();
  });

  it("says how old the data is in short Czech", () => {
    const now = Date.parse("2026-10-09T18:10:00.000Z");
    expect(ageLabel("2026-10-09T18:09:50.000Z", now)).toBe("před 10 s");
    expect(ageLabel("2026-10-09T18:07:00.000Z", now)).toBe("před 3 min");
    expect(ageLabel("2026-10-09T16:55:00.000Z", now)).toBe("před 1 h 15 min");
    expect(ageLabel("2026-10-09T18:10:30.000Z", now)).toBe("právě teď");
    expect(ageLabel(null, now)).toBe("zatím nic");
  });
});
