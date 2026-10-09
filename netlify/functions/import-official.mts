// Netlify scheduled function: pulls new ČSÚ precinct batches once a minute into the official-results
// database. Runs only on the published deploy; locally use `npm run import:official` instead.

import { officialDbFromEnv } from "../../lib/official-db.ts";
import { importAvailableBatches } from "../../lib/official-import.ts";

export default async function importOfficial() {
  const db = officialDbFromEnv();
  if (!db) {
    console.log("OFFICIAL_RESULTS_DATABASE_URL is not set; nothing imported.");
    return;
  }
  // Scheduled functions stop after 30 s; three batches per run catch up quickly after an outage.
  const steps = await importAvailableBatches(db, { maxBatches: 3 });
  for (const step of steps) console.log(JSON.stringify(step));
}

export const config = { schedule: "* * * * *" };
