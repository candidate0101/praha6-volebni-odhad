// Applies one schema to its own database:
//   npm run db:manual:apply    db/manual-entries.sql   -> MANUAL_ENTRIES_DATABASE_URL
//   npm run db:official:apply  db/official-results.sql -> OFFICIAL_RESULTS_DATABASE_URL

import { readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
import { OFFICIAL_DB_ENV } from "../lib/official-db.ts";
import { MANUAL_DB_ENV } from "../lib/server-db.ts";

const targets = {
  manual: { file: "../db/manual-entries.sql", env: MANUAL_DB_ENV },
  official: { file: "../db/official-results.sql", env: OFFICIAL_DB_ENV },
} as const;

const target = targets[process.argv[2] as keyof typeof targets];
if (!target) {
  console.error("Použití: node scripts/apply-schema.ts manual|official");
  process.exit(1);
}
const url = process.env[target.env]?.trim();
if (!url) {
  console.error(`${target.env} není nastavená.`);
  process.exit(1);
}
if (process.env[MANUAL_DB_ENV]?.trim() && process.env[MANUAL_DB_ENV]?.trim() === process.env[OFFICIAL_DB_ENV]?.trim()) {
  console.error("Ruční zápisy a oficiální výsledky musí mít každý svou databázi; obě proměnné ukazují na stejnou.");
  process.exit(1);
}

const schema = await readFile(new URL(target.file, import.meta.url), "utf8");
const pool = new Pool({ connectionString: url });
try {
  await pool.query(schema);
  console.log(`Schéma ${process.argv[2]} je aplikované.`);
} finally {
  await pool.end();
}
