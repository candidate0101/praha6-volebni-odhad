import { describe, expect, it } from "vitest";
import { buildOfficialDashboard, officialForecastEntries, selectCurrentRevisions, type OfficialPrecinctRevision } from "./official-results";

function revision(overrides: Partial<OfficialPrecinctRevision>): OfficialPrecinctRevision {
  return {
    precinctNumber: 6001,
    batchNumber: 1,
    processingOrder: 1,
    resent: false,
    validVotes: 10,
    listVotes: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    validationStatus: "valid",
    validationNote: null,
    sourceUrl: "https://volby.gov.cz/appdata/kv2026/20261009/odata/okrsky/vysledky_okrsky_00001.xml",
    sourceSha256: "0".repeat(64),
    fetchedAt: "2026-10-10T12:40:00.000Z",
    ...overrides,
  };
}

describe("selectCurrentRevisions", () => {
  it("follows the highest PORADI_ZPRAC regardless of input order or fetch time", () => {
    const newer = revision({ batchNumber: 2, processingOrder: 40, validVotes: 12, resent: true, fetchedAt: "2026-10-10T14:00:00+02:00" });
    const older = revision({ batchNumber: 3, processingOrder: 12, validVotes: 10, fetchedAt: "2026-10-10T12:30:00Z" });
    expect(selectCurrentRevisions([newer, older])[0].validVotes).toBe(12);
    expect(selectCurrentRevisions([older, newer])[0].validVotes).toBe(12);
  });

  it("breaks an exact PORADI_ZPRAC tie by batch number, then by parsed fetch time", () => {
    const first = revision({ batchNumber: 1, processingOrder: 5, validVotes: 1 });
    const second = revision({ batchNumber: 2, processingOrder: 5, validVotes: 2 });
    expect(selectCurrentRevisions([second, first])[0].validVotes).toBe(2);
    const earlier = revision({ processingOrder: 5, validVotes: 3, fetchedAt: "2026-10-10T14:30:00+02:00" });
    const later = revision({ processingOrder: 5, validVotes: 4, fetchedAt: "2026-10-10T12:35:00Z" });
    expect(selectCurrentRevisions([later, earlier])[0].validVotes).toBe(4);
  });
});

describe("buildOfficialDashboard", () => {
  it("counts only consistent precincts as processed and keeps discrepancies out of the projection", () => {
    const dashboard = buildOfficialDashboard({
      connection: "connected",
      connectionMessage: "ok",
      revisions: [
        revision({ precinctNumber: 6001 }),
        revision({ precinctNumber: 6002, validationStatus: "discrepancy", validationNote: "součet ≠ PLATNE_HLASY" }),
        revision({ precinctNumber: 6003, resent: true, processingOrder: 9 }),
      ],
      imports: [
        { batchNumber: 1, fetchedAt: "2026-10-10T12:40:00.000Z", sourceUrl: "u1", sourceSha256: "a".repeat(64), parserVersion: "p", status: "accepted", rejectionReason: null, precinctCount: 3 },
        { batchNumber: 2, fetchedAt: "2026-10-10T12:45:00.000Z", sourceUrl: "u2", sourceSha256: "b".repeat(64), parserVersion: "p", status: "rejected", rejectionReason: "neplatný formát", precinctCount: 0 },
      ],
    }, 104);

    expect(dashboard.processedPrecincts).toBe(2);
    expect(dashboard.discrepancyPrecincts).toBe(1);
    expect(dashboard.resentPrecincts).toBe(1);
    expect(dashboard.rejectedImports).toBe(1);
    expect(dashboard.latestBatch?.batchNumber).toBe(1);
    expect(dashboard.coveragePercent).toBeCloseTo(200 / 104);
    expect(officialForecastEntries(dashboard).map((entry) => entry.number)).toEqual([6001, 6003]);
  });

  it("returns a truthful zero state that still says why there is no data", () => {
    const dashboard = buildOfficialDashboard({ connection: "not_configured", connectionMessage: "chybí databáze" }, 104);

    expect(dashboard.connection).toBe("not_configured");
    expect(dashboard.processedPrecincts).toBe(0);
    expect(dashboard.latestBatch).toBeNull();
    expect(dashboard.coveragePercent).toBe(0);
    expect(officialForecastEntries(dashboard)).toEqual([]);
  });

  it("is plain JSON so the API can send it unchanged", () => {
    const dashboard = buildOfficialDashboard({ connection: "connected", connectionMessage: "ok", revisions: [revision({})] }, 104);
    expect(JSON.parse(JSON.stringify(dashboard))).toEqual(dashboard);
  });
});
