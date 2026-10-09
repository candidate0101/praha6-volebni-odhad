// ČSÚ importer for official KV 2026 precinct batches (MČ Praha 6).
//
//   npm run import:official              poll every 60 s until stopped
//   npm run import:official -- --once    import whatever is available, then exit
//   npm run import:official -- --batch 7 fetch one specific batch again (stored only if the bytes differ)
//
// Requires OFFICIAL_RESULTS_DATABASE_URL (e.g. in .env.local) pointing at a database
// where db/official-results.sql has been applied (npm run db:official:apply).

import { OFFICIAL_DB_ENV, officialDbFromEnv } from "../lib/official-db.ts";
import { importAvailableBatches, importBatch, type ImportStep } from "../lib/official-import.ts";

const POLL_SECONDS = 60; // ČSÚ webcache refreshes at most once a minute; batches appear ~every 5 min.

function log(step: ImportStep) {
  const time = new Date().toLocaleTimeString("cs-CZ");
  if (step.outcome === "stored") console.log(`${time} dávka ${step.batchNumber}: uložena (${step.status}), okrsků Prahy 6: ${step.precincts}${step.reason ? ` — ${step.reason}` : ""}`);
  else console.log(`${time} dávka ${step.batchNumber}: ${step.outcome} — ${step.detail}`);
}

const db = officialDbFromEnv();
if (!db) {
  console.error(`${OFFICIAL_DB_ENV} není nastavená; bez oficiální databáze importér nic nestahuje.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const batchIndex = args.indexOf("--batch");
if (batchIndex >= 0) {
  const batchNumber = Number(args[batchIndex + 1]);
  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    console.error("--batch vyžaduje kladné celé číslo");
    process.exit(1);
  }
  log(await importBatch(db, batchNumber));
} else if (args.includes("--once")) {
  (await importAvailableBatches(db)).forEach(log);
} else {
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; console.log("Ukončuji po aktuálním kroku…"); });
  while (!stopping) {
    try {
      (await importAvailableBatches(db)).forEach(log);
    } catch (error) {
      console.error(new Date().toLocaleTimeString("cs-CZ"), "importér selhal:", error);
    }
    for (let waited = 0; waited < POLL_SECONDS && !stopping; waited += 1) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
