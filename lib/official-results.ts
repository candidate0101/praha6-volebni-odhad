// Official ČSÚ results only. Nothing here reads or writes the manual briefing entries.

export type OfficialPrecinctRevision = {
  precinctNumber: number;
  batchNumber: number;
  processingOrder: number;
  resent: boolean;
  validVotes: number;
  listVotes: number[];
  validationStatus: "valid" | "discrepancy";
  validationNote: string | null;
  sourceUrl: string;
  sourceSha256: string;
  fetchedAt: string;
};

export type OfficialImportSummary = {
  batchNumber: number;
  fetchedAt: string;
  sourceUrl: string;
  sourceSha256: string;
  parserVersion: string;
  status: "accepted" | "rejected";
  rejectionReason: string | null;
  precinctCount: number;
};

export type OfficialFetchAttempt = {
  attemptedAt: string;
  sourceUrl: string;
  requestedBatch: number | null;
  httpStatus: number | null;
  outcome: "stored" | "duplicate" | "not_yet_available" | "error";
  detail: string | null;
};

// not_configured: no DATABASE_URL on the server; unavailable: no server at all (static export)
// or the database could not be read; connected: the database answered.
export type OfficialConnection = "not_configured" | "unavailable" | "connected";

export type OfficialDashboard = {
  connection: OfficialConnection;
  connectionMessage: string;
  generatedAt: string | null;
  precincts: OfficialPrecinctRevision[];
  processedPrecincts: number;
  discrepancyPrecincts: number;
  resentPrecincts: number;
  coveragePercent: number;
  latestBatch: OfficialImportSummary | null;
  imports: OfficialImportSummary[];
  rejectedImports: number;
  lastAttempt: OfficialFetchAttempt | null;
};

export type OfficialDashboardInput = {
  connection: OfficialConnection;
  connectionMessage: string;
  generatedAt?: string | null;
  revisions?: OfficialPrecinctRevision[];
  imports?: OfficialImportSummary[];
  lastAttempt?: OfficialFetchAttempt | null;
};

function isNewer(candidate: OfficialPrecinctRevision, current: OfficialPrecinctRevision): boolean {
  // ČSÚ rule: the highest PORADI_ZPRAC wins. Batch number and fetch time only break exact ties.
  if (candidate.processingOrder !== current.processingOrder) return candidate.processingOrder > current.processingOrder;
  if (candidate.batchNumber !== current.batchNumber) return candidate.batchNumber > current.batchNumber;
  return Date.parse(candidate.fetchedAt) > Date.parse(current.fetchedAt);
}

export function selectCurrentRevisions(revisions: OfficialPrecinctRevision[]): OfficialPrecinctRevision[] {
  const current = new Map<number, OfficialPrecinctRevision>();
  for (const revision of revisions) {
    const existing = current.get(revision.precinctNumber);
    if (!existing || isNewer(revision, existing)) current.set(revision.precinctNumber, revision);
  }
  return [...current.values()].sort((left, right) => left.precinctNumber - right.precinctNumber);
}

export function buildOfficialDashboard(input: OfficialDashboardInput, totalPrecincts: number): OfficialDashboard {
  const precincts = selectCurrentRevisions(input.revisions ?? []);
  const imports = [...(input.imports ?? [])].sort((left, right) => right.batchNumber - left.batchNumber || Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt));
  const processedPrecincts = precincts.filter((precinct) => precinct.validationStatus === "valid").length;
  return {
    connection: input.connection,
    connectionMessage: input.connectionMessage,
    generatedAt: input.generatedAt ?? null,
    precincts,
    processedPrecincts,
    discrepancyPrecincts: precincts.filter((precinct) => precinct.validationStatus === "discrepancy").length,
    resentPrecincts: precincts.filter((precinct) => precinct.resent).length,
    coveragePercent: totalPrecincts ? processedPrecincts / totalPrecincts * 100 : 0,
    latestBatch: imports.find((summary) => summary.status === "accepted") ?? null,
    imports,
    rejectedImports: imports.filter((summary) => summary.status === "rejected").length,
    lastAttempt: input.lastAttempt ?? null,
  };
}

// Input for the official-only projection on /official-results. Discrepant precincts stay out
// until ČSÚ resends a consistent revision.
export function officialForecastEntries(dashboard: OfficialDashboard): Array<{ number: number; validVotes: number; listVotes: number[] }> {
  return dashboard.precincts
    .filter((precinct) => precinct.validationStatus === "valid")
    .map((precinct) => ({ number: precinct.precinctNumber, validVotes: precinct.validVotes, listVotes: precinct.listVotes }));
}
