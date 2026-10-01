/**
 * Database migration runner for AutoTube.
 *
 * Reads migration files from server/migrations/ in order,
 * tracks applied migrations in a _migrations table,
 * and runs only unapplied migrations.
 *
 * Usage:
 *   node server/migrate.mjs              # uses default DB path
 *   node server/migrate.mjs --db ./data/autotube.db
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DB_PATH = join(__dirname, "..", "data", "autotube.db");
const MIGRATIONS_DIR = join(__dirname, "migrations");

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = DEFAULT_DB_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db" && args[i + 1]) {
      dbPath = args[i + 1];
      i++;
    }
  }

  return { dbPath };
}

async function runMigrations() {
  const { dbPath } = parseArgs();

  // Dynamically import better-sqlite3 (or sqlite3)
  let Database;
  try {
    const sqlite = await import("better-sqlite3");
    Database = sqlite.default;
  } catch {
    console.error(
      "Error: better-sqlite3 is required. Install with: npm install better-sqlite3",
    );
    process.exit(1);
  }

  // Ensure data directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  console.log(`\n📦 Running migrations against: ${dbPath}\n`);

  const db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get already applied migrations
  const applied = db
    .prepare("SELECT name FROM _migrations ORDER BY name")
    .all()
    .map((row) => row.name);

  // Read migration files in order
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = migrationFiles.filter((f) => !applied.includes(f));

  if (pending.length === 0) {
    console.log("✅ No pending migrations. Database is up to date.");
    db.close();
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);
  for (const f of pending) {
    console.log(`  → ${f}`);
  }
  console.log("");

  // Run each pending migration in a transaction
  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    console.log(`Applying ${file}...`);

    try {
      db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      })();
      console.log(`  ✅ ${file} applied`);
    } catch (err) {
      console.error(`  ❌ ${file} failed:`, err.message);
      db.close();
      process.exit(1);
    }
  }

  console.log(`\n✅ All migrations applied successfully.`);
  db.close();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
