// Server-only adapter for the dedicated official-results database.
// The variable is deliberately separate from the manual-entries database.

import { dbFromUrl } from "./server-db.ts";
import type { OfficialDb } from "./official-store.ts";

export const OFFICIAL_DB_ENV = "OFFICIAL_RESULTS_DATABASE_URL";

export function officialDbFromEnv(env: Record<string, string | undefined> = process.env): OfficialDb | null {
  const url = env[OFFICIAL_DB_ENV]?.trim();
  return url ? dbFromUrl(url, "db/official-results.sql") : null;
}
