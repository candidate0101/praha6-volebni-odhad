import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CsuFormatError, parseOkrskyResponse } from "./csu-okrsky";

// Real ČSÚ response captured 2026-10-09 from .../kv2026/20261009/odata/okrsky/vysledky_okrsky.xml
const liveNotYetAvailable = readFileSync(new URL("./__fixtures__/csu-okrsky-live-chyba-10.xml", import.meta.url), "utf8");
// Synthetic, XSD-valid format sample (fictional numbers, see the comment inside the file).
const formatSample = readFileSync(new URL("./__fixtures__/csu-okrsky-format-sample.xml", import.meta.url), "utf8");

function withPrecinct(attributes: string, body = '<UCAST_OKRSEK ZAPSANI_VOLICI="1" VYDANE_OBALKY="1" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="1" PLATNE_LISTKY="1" PLATNE_HLASY="1"/><HLASY_OKRSEK POR_STR_HLAS_LIST="1" HLASY="1"/>') {
  return `<VYSLEDKY_OKRSKY xmlns="http://www.volby.cz/kv/" DATUM_CAS_GENEROVANI="2026-10-10T14:35:00"><DAVKA DATUMVOLEB="20261009" PORADI_DAVKY="1" OKRSKY_DAVKA="1" OKRSKY_CELKEM="1" OKRSKY_ZPRAC="1"/>`
    + `<OKRSEK CIS_OBEC="554782" KODZASTUP="500178" CIS_OBVODU="1" OZNAC_TYPU="MCMO" DATUM_CAS_ZPRAC="2026-10-10T14:31:00" OPAKOVANE="false" ${attributes}>${body}</OKRSEK></VYSLEDKY_OKRSKY>`;
}

describe("parseOkrskyResponse", () => {
  it("recognises the live ČSÚ answer before counting starts (KOD_CHYBY 10)", () => {
    expect(parseOkrskyResponse(liveNotYetAvailable)).toEqual({ kind: "not_yet_available", generatedAtLocal: "2026-10-08T16:35:00", errorCode: 10 });
  });

  it("keeps only MČ Praha 6 (KODZASTUP 500178, MCMO) and maps ballot numbers 1–11", () => {
    const parsed = parseOkrskyResponse(formatSample);
    if (parsed.kind !== "batch") throw new Error("expected a batch");
    expect(parsed.batchNumber).toBe(1);
    expect(parsed.nationalPrecinctsTotal).toBe(14000);
    expect(parsed.precincts.map((precinct) => precinct.precinctNumber)).toEqual([6001, 6002]);
    const [first, second] = parsed.precincts;
    expect(first).toMatchObject({ processingOrder: 12, validVotes: 660, resent: false, validationStatus: "valid", validationNote: null });
    expect(first.listVotes).toEqual([100, 10, 0, 40, 0, 0, 300, 0, 0, 0, 210]);
    expect(second.validationStatus).toBe("discrepancy");
    expect(second.validationNote).toContain("400 ≠ PLATNE_HLASY 500");
  });

  it("reports other ČSÚ error codes as source errors", () => {
    expect(parseOkrskyResponse('<VYSLEDKY_OKRSKY DATUM_CAS_GENEROVANI="2026-10-10T14:35:00"><CHYBA KOD_CHYBY="9999">jiná chyba</CHYBA></VYSLEDKY_OKRSKY>'))
      .toEqual({ kind: "source_error", generatedAtLocal: "2026-10-10T14:35:00", errorCode: 9999, message: "jiná chyba" });
  });

  it.each([
    ["a DTD", `<!DOCTYPE x [<!ENTITY a "b">]>${withPrecinct('CIS_OKRSEK="6001" PORADI_ZPRAC="1"')}`],
    ["a Praha 6 precinct outside 6001–6104", withPrecinct('CIS_OKRSEK="6200" PORADI_ZPRAC="1"')],
    ["an unknown ballot list", withPrecinct('CIS_OKRSEK="6001" PORADI_ZPRAC="1"', '<UCAST_OKRSEK ZAPSANI_VOLICI="1" VYDANE_OBALKY="1" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="1" PLATNE_LISTKY="1" PLATNE_HLASY="1"/><HLASY_OKRSEK POR_STR_HLAS_LIST="12" HLASY="1"/>')],
    ["a negative vote count", withPrecinct('CIS_OKRSEK="6001" PORADI_ZPRAC="1"', '<UCAST_OKRSEK ZAPSANI_VOLICI="1" VYDANE_OBALKY="1" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="1" PLATNE_LISTKY="1" PLATNE_HLASY="1"/><HLASY_OKRSEK POR_STR_HLAS_LIST="1" HLASY="-1"/>')],
    ["a missing PORADI_ZPRAC", withPrecinct('CIS_OKRSEK="6001"')],
    ["truncated XML", formatSample.slice(0, 900)],
    ["an HTML error page", "<!DOCTYPE html><html><body>Chyba 404</body></html>"],
  ])("rejects %s", (_, xml) => {
    expect(() => parseOkrskyResponse(xml)).toThrow(CsuFormatError);
  });

  it("rejects a batch that lists the same Praha 6 precinct twice", () => {
    const duplicated = formatSample.replace('CIS_OKRSEK="6002"', 'CIS_OKRSEK="6001"');
    expect(() => parseOkrskyResponse(duplicated)).toThrow("twice");
  });
});
