// Applies database migrations to the DATABASE_URL database (Neon).
// Usage: npx tsx --env-file=.env.local scripts/migrate.mts
import { migrateNeonDb } from "../src/db";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
await migrateNeonDb(process.env.DATABASE_URL);
console.log("Migrations applied.");
