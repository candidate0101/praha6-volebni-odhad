// Pulls incremental ČSÚ precinct batches in order and stores them append-only.
// Batches are numbered from 1; a missing batch answers HTTP 404 or <CHYBA KOD_CHYBY="10"/>.

import { CsuFormatError, PARSER_VERSION, parseOkrskyResponse, type ParsedPrecinct } from "./csu-okrsky.ts";
import { lastStoredBatch, recordAttempt, runExists, storeRunStatements, type OfficialDb } from "./official-store.ts";

// First day of the KV 2026 election, as used in the ČSÚ URL (KV2026_XML.htm v1.1).
export const ELECTION_DATE = "20261009";
export const OKRSKY_BASE_URL = `https://volby.gov.cz/appdata/kv2026/${ELECTION_DATE}/odata/okrsky/`;

export function batchUrl(batchNumber: number, baseUrl = OKRSKY_BASE_URL): string {
  return `${baseUrl}vysledky_okrsky_${String(batchNumber).padStart(5, "0")}.xml`;
}

export type ImportStep =
  | { batchNumber: number; outcome: "stored"; status: "accepted" | "rejected"; precincts: number; reason?: string }
  | { batchNumber: number; outcome: "not_yet_available" | "duplicate" | "error"; detail: string };

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)));
}

export async function importBatch(db: OfficialDb, batchNumber: number, options: { fetchImpl?: typeof fetch; now?: () => Date; baseUrl?: string } = {}): Promise<ImportStep> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sourceUrl = batchUrl(batchNumber, options.baseUrl);
  let response: Response;
  try {
    response = await fetchImpl(sourceUrl, { cache: "no-store", headers: { accept: "application/xml, text/xml" } });
  } catch (error) {
    const detail = `network error: ${error instanceof Error ? error.message : String(error)}`;
    await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: null, outcome: "error", detail });
    return { batchNumber, outcome: "error", detail };
  }
  if (response.status === 404) {
    await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: 404, outcome: "not_yet_available", detail: "HTTP 404" });
    return { batchNumber, outcome: "not_yet_available", detail: "HTTP 404" };
  }
  if (!response.ok) {
    const detail = `HTTP ${response.status}`;
    await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "error", detail });
    return { batchNumber, outcome: "error", detail };
  }

  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  let precincts: ParsedPrecinct[] = [];
  let generatedAtLocal = "";
  let national: { total: number; processed: number } | null = null;
  let rejectionReason: string | null = null;
  try {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CsuFormatError("payload is not valid UTF-8", "document");
    }
    const parsed = parseOkrskyResponse(text);
    if (parsed.kind === "not_yet_available") {
      await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "not_yet_available", detail: `KOD_CHYBY ${parsed.errorCode}`, sha256 });
      return { batchNumber, outcome: "not_yet_available", detail: `KOD_CHYBY ${parsed.errorCode}` };
    }
    if (parsed.kind === "source_error") {
      const detail = `KOD_CHYBY ${parsed.errorCode}${parsed.message ? `: ${parsed.message}` : ""}`;
      await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "error", detail, sha256 });
      return { batchNumber, outcome: "error", detail };
    }
    if (parsed.batchNumber !== batchNumber) throw new CsuFormatError(`PORADI_DAVKY ${parsed.batchNumber} ≠ požadovaná dávka ${batchNumber}`, "document");
    generatedAtLocal = parsed.generatedAtLocal;
    national = { total: parsed.nationalPrecinctsTotal, processed: parsed.nationalPrecinctsProcessed };
    precincts = parsed.precincts;
  } catch (error) {
    if (!(error instanceof CsuFormatError)) throw error;
    // Not a usable ČSÚ batch (maintenance page, truncated download, other batch): nothing is
    // stored as a run and the same batch number is retried on the next poll, so no batch is skipped.
    if (error.scope === "document" || error.batchNumber !== batchNumber || !error.generatedAtLocal) {
      const detail = `nepoužitelná odpověď, zkusí se znovu: ${error.message}`;
      await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "error", detail, sha256 });
      return { batchNumber, outcome: "error", detail };
    }
    generatedAtLocal = error.generatedAtLocal;
    rejectionReason = `neplatný obsah dávky: ${error.message}`;
  }

  if (await runExists(db, sha256, PARSER_VERSION)) {
    await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "duplicate", detail: "stejný SHA-256 a verze parseru už jsou uloženy", sha256 });
    return { batchNumber, outcome: "duplicate", detail: sha256 };
  }
  const status = rejectionReason ? "rejected" : "accepted";
  try {
    await db.transaction(storeRunStatements({
      sourceUrl,
      batchNumber,
      generatedAtLocal,
      fetchedAt,
      sha256,
      rawPayloadHex: toHex(bytes),
      parserVersion: PARSER_VERSION,
      status,
      rejectionReason,
      nationalPrecinctsTotal: national?.total ?? null,
      nationalPrecinctsProcessed: national?.processed ?? null,
      precincts,
    }));
  } catch (error) {
    const detail = `database error: ${error instanceof Error ? error.message : String(error)}`;
    await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "error", detail, sha256 });
    return { batchNumber, outcome: "error", detail };
  }
  await recordAttempt(db, { sourceUrl, requestedBatch: batchNumber, httpStatus: response.status, outcome: "stored", detail: rejectionReason ?? `${precincts.length} okrsků Prahy 6`, sha256 });
  return { batchNumber, outcome: "stored", status, precincts: precincts.length, ...(rejectionReason ? { reason: rejectionReason } : {}) };
}

// Imports every batch after the last stored one until ČSÚ has nothing newer.
export async function importAvailableBatches(db: OfficialDb, options: { fetchImpl?: typeof fetch; now?: () => Date; baseUrl?: string; maxBatches?: number } = {}): Promise<ImportStep[]> {
  const steps: ImportStep[] = [];
  let next = (await lastStoredBatch(db)) + 1;
  for (let count = 0; count < (options.maxBatches ?? 500); count += 1) {
    const step = await importBatch(db, next, options);
    steps.push(step);
    if (step.outcome !== "stored") break;
    next += 1;
  }
  return steps;
}
