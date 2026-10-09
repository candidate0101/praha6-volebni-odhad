// Server-only database adapters. Manual entries and official results use separate databases
// (separate variables), so neither flow can read or write the other's tables.
//
// Production: a Neon connection string. Local test mode: "pglite:<directory>" runs a file-backed
// Postgres (PGlite) inside the Next server and applies the schema on first use; never on Netlify.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import type { OfficialDb } from "./official-store.ts";

export const MANUAL_DB_ENV = "MANUAL_ENTRIES_DATABASE_URL";

export function neonDb(url: string): OfficialDb {
  const sql = neon(url);
  return {
    async query<Row>(text: string, params: unknown[] = []) {
      return await sql.query(text, params) as Row[];
    },
    async transaction(statements) {
      await sql.transaction(statements.map((statement) => sql.query(statement.text, statement.params)));
    },
  };
}

type PgliteLike = {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(text: string): Promise<unknown>;
  transaction<T>(callback: (tx: { query(text: string, params?: unknown[]): Promise<unknown> }) => Promise<T>): Promise<T>;
};

// Kept on globalThis so dev hot reloads never open the same data directory twice.
const pgliteInstances: Map<string, Promise<PgliteLike>> = ((globalThis as { __p6Pglite?: Map<string, Promise<PgliteLike>> }).__p6Pglite ??= new Map());

function pgliteDb(directory: string, schemaFile: string): OfficialDb {
  const open = () => {
    let instance = pgliteInstances.get(directory);
    if (!instance) {
      instance = (async () => {
        const { PGlite } = await import("@electric-sql/pglite") as unknown as { PGlite: new (dataDir: string) => PgliteLike };
        const db = new PGlite(directory);
        await db.exec(await readFile(join(process.cwd(), schemaFile), "utf8"));
        return db;
      })();
      pgliteInstances.set(directory, instance);
    }
    return instance;
  };
  return {
    async query<Row>(text: string, params: unknown[] = []) {
      return (await (await open()).query<Row>(text, params)).rows;
    },
    async transaction(statements) {
      await (await open()).transaction(async (tx) => { for (const statement of statements) await tx.query(statement.text, statement.params); });
    },
  };
}

export function dbFromUrl(url: string, schemaFile: string): OfficialDb {
  return url.startsWith("pglite:") ? pgliteDb(url.slice("pglite:".length), schemaFile) : neonDb(url);
}

export function manualDbFromEnv(env: Record<string, string | undefined> = process.env): OfficialDb | null {
  const url = env[MANUAL_DB_ENV]?.trim();
  return url ? dbFromUrl(url, "db/manual-entries.sql") : null;
}
