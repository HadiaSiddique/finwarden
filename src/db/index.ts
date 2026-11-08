// Database client: Neon in production (DATABASE_URL set), PGlite locally and in tests.
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// `:memory:` gives each test run a fresh database.
export async function createPgliteDb(dataDir = ".pglite"): Promise<DB> {
  const client = dataDir === ":memory:" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

function createNeonDb(url: string): DB {
  // Same query API; the PGlite type is used as the shared shape.
  return drizzleNeon(neon(url), { schema }) as unknown as DB;
}

export async function migrateNeonDb(url: string) {
  await migrateNeon(drizzleNeon(neon(url), { schema }), { migrationsFolder: MIGRATIONS });
}

const globalForDb = globalThis as unknown as { fwDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!globalForDb.fwDb) {
    const url = process.env.DATABASE_URL;
    globalForDb.fwDb = url ? Promise.resolve(createNeonDb(url)) : createPgliteDb(process.env.PGLITE_DIR ?? ".pglite");
  }
  return globalForDb.fwDb;
}

// Tests swap in their own database.
export function setDb(db: DB) {
  globalForDb.fwDb = Promise.resolve(db);
}

export { schema };
