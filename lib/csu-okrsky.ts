// Parser for ČSÚ incremental precinct batches (KV 2026, vysledky_okrsky_NNNNN.xml).
// Format: https://volby.gov.cz/opendata/kv2026/KV2026_XML.htm (v1.1, 06.10.2026), XSD kv_vysledky_okrsky.xsd.
// The national feed lists every precinct in the country; only MČ Praha 6 rows are kept.

import { PRAHA6 } from "./praha6.ts";

export { PRAHA6 };

export const PARSER_VERSION = "csu-kv2026-okrsky@1";

export type ParsedPrecinct = {
  precinctNumber: number;
  processingOrder: number;
  processedAtLocal: string;
  resent: boolean;
  registeredVoters: number;
  issuedEnvelopes: number;
  returnedEnvelopes: number;
  validBallots: number;
  validVotes: number;
  listVotes: number[];
  validationStatus: "valid" | "discrepancy";
  validationNote: string | null;
};

export type ParsedOkrskyResponse =
  | {
    kind: "batch";
    batchNumber: number;
    generatedAtLocal: string;
    electionDate: string;
    nationalPrecinctsTotal: number;
    nationalPrecinctsProcessed: number;
    precincts: ParsedPrecinct[];
  }
  // KOD_CHYBY 10: the batch does not exist yet (before counting starts).
  | { kind: "not_yet_available"; generatedAtLocal: string; errorCode: number }
  | { kind: "source_error"; generatedAtLocal: string; errorCode: number; message: string };

// scope "document": the payload is not a usable ČSÚ batch document at all (HTML error page,
// truncated download, wrong root). scope "content": a real batch whose Praha 6 data is invalid.
export class CsuFormatError extends Error {
  constructor(message: string, readonly scope: "document" | "content" = "content", readonly batchNumber: number | null = null, readonly generatedAtLocal: string | null = null) {
    super(message);
  }
}

type XmlElement = { name: string; attributes: Record<string, string>; children: XmlElement[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()];
    return String.fromCodePoint(entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}

// The ČSÚ format uses attributes only (plus text inside CHYBA). DTDs are refused outright,
// so no entity expansion can be smuggled in.
function parseXml(xml: string): XmlElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CsuFormatError("DTD/ENTITY is not allowed in ČSÚ payload");
  const body = xml.replace(/^﻿/, "").replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const tagPattern = /<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const attributePattern = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let cursor = 0;
  for (const match of body.matchAll(tagPattern)) {
    const between = body.slice(cursor, match.index);
    if (between.includes("<")) throw new CsuFormatError("Malformed XML markup");
    if (stack.length) stack[stack.length - 1].text += decodeEntities(between);
    else if (between.trim()) throw new CsuFormatError("Text outside the root element");
    cursor = match.index + match[0].length;
    const [, closing, name, rawAttributes, selfClosing] = match;
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) throw new CsuFormatError(`Unbalanced closing tag </${name}>`);
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const attribute of rawAttributes.matchAll(attributePattern)) attributes[attribute[1]] = decodeEntities(attribute[2] ?? attribute[3]);
    const element: XmlElement = { name, attributes, children: [], text: "" };
    if (stack.length) stack[stack.length - 1].children.push(element);
    else if (root) throw new CsuFormatError("More than one root element");
    else root = element;
    if (!selfClosing) stack.push(element);
  }
  if (body.slice(cursor).trim() || stack.length || !root) throw new CsuFormatError("Truncated or malformed XML");
  return root;
}

function attribute(element: XmlElement, name: string): string {
  const value = element.attributes[name];
  if (value === undefined) throw new CsuFormatError(`${element.name} is missing ${name}`);
  return value.trim();
}

function integer(element: XmlElement, name: string): number {
  const value = attribute(element, name);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new CsuFormatError(`${element.name}@${name} is not a non-negative integer: "${value}"`);
  return Number(value);
}

function dateTime(element: XmlElement, name: string): string {
  const value = attribute(element, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value)) throw new CsuFormatError(`${element.name}@${name} is not an xs:dateTime: "${value}"`);
  return value;
}

function only(parent: XmlElement, name: string): XmlElement {
  const found = parent.children.filter((child) => child.name === name);
  if (found.length !== 1) throw new CsuFormatError(`${parent.name} must contain exactly one ${name}`);
  return found[0];
}

function parsePrecinct(element: XmlElement): ParsedPrecinct {
  const precinctNumber = integer(element, "CIS_OKRSEK");
  if (precinctNumber < PRAHA6.firstPrecinct || precinctNumber > PRAHA6.lastPrecinct) throw new CsuFormatError(`Praha 6 precinct ${precinctNumber} is outside ${PRAHA6.firstPrecinct}–${PRAHA6.lastPrecinct}`);
  const resent = attribute(element, "OPAKOVANE");
  if (!["true", "false", "1", "0"].includes(resent)) throw new CsuFormatError(`OKRSEK ${precinctNumber}@OPAKOVANE is not boolean`);
  const turnout = only(element, "UCAST_OKRSEK");
  const listVotes = Array.from({ length: PRAHA6.ballotLists }, () => 0);
  const seenBallots = new Set<number>();
  // Lists without a HLASY_OKRSEK row (minOccurs=0) received no votes in this precinct.
  for (const row of element.children.filter((child) => child.name === "HLASY_OKRSEK")) {
    const ballot = integer(row, "POR_STR_HLAS_LIST");
    if (ballot < 1 || ballot > PRAHA6.ballotLists) throw new CsuFormatError(`OKRSEK ${precinctNumber} has unknown ballot list ${ballot}`);
    if (seenBallots.has(ballot)) throw new CsuFormatError(`OKRSEK ${precinctNumber} repeats ballot list ${ballot}`);
    seenBallots.add(ballot);
    listVotes[ballot - 1] = integer(row, "HLASY");
  }
  const validVotes = integer(turnout, "PLATNE_HLASY");
  const issuedEnvelopes = integer(turnout, "VYDANE_OBALKY");
  const returnedEnvelopes = integer(turnout, "ODEVZDANE_OBALKY");
  const validBallots = integer(turnout, "PLATNE_LISTKY");
  const listTotal = listVotes.reduce((sum, votes) => sum + votes, 0);
  const problems: string[] = [];
  if (listTotal !== validVotes) problems.push(`součet hlasů listin ${listTotal} ≠ PLATNE_HLASY ${validVotes}`);
  if (validBallots > returnedEnvelopes) problems.push(`PLATNE_LISTKY ${validBallots} > ODEVZDANE_OBALKY ${returnedEnvelopes}`);
  return {
    precinctNumber,
    processingOrder: integer(element, "PORADI_ZPRAC"),
    processedAtLocal: dateTime(element, "DATUM_CAS_ZPRAC"),
    resent: resent === "true" || resent === "1",
    registeredVoters: integer(turnout, "ZAPSANI_VOLICI"),
    issuedEnvelopes,
    returnedEnvelopes,
    validBallots,
    validVotes,
    listVotes,
    validationStatus: problems.length ? "discrepancy" : "valid",
    validationNote: problems.length ? problems.join("; ") : null,
  };
}

function asDocumentError<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof CsuFormatError) throw new CsuFormatError(error.message, "document");
    throw error;
  }
}

export function parseOkrskyResponse(xml: string): ParsedOkrskyResponse {
  const { root, generatedAtLocal } = asDocumentError(() => {
    const root = parseXml(xml);
    if (root.name !== "VYSLEDKY_OKRSKY") throw new CsuFormatError(`Unexpected root element ${root.name}`);
    return { root, generatedAtLocal: dateTime(root, "DATUM_CAS_GENEROVANI") };
  });
  const error = root.children.find((child) => child.name === "CHYBA");
  if (error) {
    const errorCode = asDocumentError(() => integer(error, "KOD_CHYBY"));
    if (errorCode === 10) return { kind: "not_yet_available", generatedAtLocal, errorCode };
    return { kind: "source_error", generatedAtLocal, errorCode, message: error.text.trim() };
  }
  const { batch, batchNumber } = asDocumentError(() => {
    const batch = only(root, "DAVKA");
    const batchNumber = integer(batch, "PORADI_DAVKY");
    if (batchNumber < 1) throw new CsuFormatError("PORADI_DAVKY must be ≥ 1");
    return { batch, batchNumber };
  });
  try {
    const okrsky = root.children.filter((child) => child.name === "OKRSEK");
    const precincts = okrsky
      .filter((element) => attribute(element, "OZNAC_TYPU") === PRAHA6.councilType && integer(element, "KODZASTUP") === PRAHA6.councilCode)
      .map(parsePrecinct);
    const seen = new Set<number>();
    for (const precinct of precincts) {
      if (seen.has(precinct.precinctNumber)) throw new CsuFormatError(`Batch lists precinct ${precinct.precinctNumber} twice`);
      seen.add(precinct.precinctNumber);
    }
    // OKRSKY_DAVKA is deliberately not compared with the element count: in Praha one physical
    // precinct appears twice (OBEC and MCMO) and the spec does not say which one it counts.
    return {
      kind: "batch",
      batchNumber,
      generatedAtLocal,
      electionDate: attribute(batch, "DATUMVOLEB"),
      nationalPrecinctsTotal: integer(batch, "OKRSKY_CELKEM"),
      nationalPrecinctsProcessed: integer(batch, "OKRSKY_ZPRAC"),
      precincts,
    };
  } catch (error) {
    if (error instanceof CsuFormatError) throw new CsuFormatError(error.message, "content", batchNumber, generatedAtLocal);
    throw error;
  }
}
