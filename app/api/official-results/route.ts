// Live read model for /official-results. Removed before the GitHub Pages static export,
// where the page then reports that no live connection exists.

import { PRAHA6 } from "../../../lib/csu-okrsky.ts";
import { OFFICIAL_DB_ENV, officialDbFromEnv } from "../../../lib/official-db.ts";
import { buildOfficialDashboard } from "../../../lib/official-results.ts";
import { loadDashboardRows } from "../../../lib/official-store.ts";
import { sessionFromRequest, teamAuthFromEnv } from "../../../lib/team-session.ts";

export const dynamic = "force-dynamic";

const TOTAL_PRECINCTS = PRAHA6.lastPrecinct - PRAHA6.firstPrecinct + 1;
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const auth = teamAuthFromEnv();
  if (auth.kind === "misconfigured") return Response.json({ error: auth.reason }, { status: 500, headers: NO_STORE });
  if (auth.kind === "enabled" && !(await sessionFromRequest(request, auth))) return Response.json({ error: "Přihlaste se týmovým heslem." }, { status: 401, headers: NO_STORE });
  const db = officialDbFromEnv();
  if (!db) {
    return Response.json(buildOfficialDashboard({
      connection: "not_configured",
      connectionMessage: `Databáze oficiálních výsledků není nastavená (${OFFICIAL_DB_ENV} chybí), importér proto nic neukládá.`,
    }, TOTAL_PRECINCTS), { headers: NO_STORE });
  }
  try {
    const rows = await loadDashboardRows(db);
    return Response.json(buildOfficialDashboard({
      connection: "connected",
      connectionMessage: "Databáze oficiálních výsledků je připojena.",
      generatedAt: new Date().toISOString(),
      ...rows,
    }, TOTAL_PRECINCTS), { headers: NO_STORE });
  } catch (error) {
    console.error("official-results read failed", error);
    return Response.json(buildOfficialDashboard({
      connection: "unavailable",
      connectionMessage: "Databázi oficiálních výsledků se nepodařilo přečíst. Údaje nejsou aktuální.",
    }, TOTAL_PRECINCTS), { status: 503, headers: NO_STORE });
  }
}
