/**
 * Run this script on Replit to apply DB schema changes:
 *   npx tsx lib/db/migrate.ts
 * 
 * This uses drizzle-kit push which safely adds new columns/tables
 * without dropping existing data.
 */
import { execSync } from "child_process";

console.log("Running Drizzle schema push...");
try {
  execSync("npx drizzle-kit push", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("✅ Migration complete");
} catch (err) {
  console.error("❌ Migration failed:", err);
  process.exit(1);
}
