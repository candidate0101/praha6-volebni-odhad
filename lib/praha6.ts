// Static facts about MČ Praha 6 for KV 2026, verified against the ČSÚ registry
// KV2026reg20261007 (KVRZCOCO / KVROS). Shared by the manual and the official flow;
// it contains no results.
export const PRAHA6 = {
  councilCode: 500178,
  councilType: "MCMO",
  firstPrecinct: 6001,
  lastPrecinct: 6104,
  ballotLists: 11,
  seats: 45,
} as const;

export const PRAHA6_PRECINCT_COUNT = PRAHA6.lastPrecinct - PRAHA6.firstPrecinct + 1;
