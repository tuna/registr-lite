import { sql } from "bun";

type Migration = {
  version: number;
  up: () => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    up: async () => {
      console.log('Running migration 1: Create initial entries table');
      await sql`
        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          nickname TEXT NOT NULL,
          dept TEXT,
          studentId TEXT,
          createdAt TEXT,
          UNIQUE(email)
        )
      `.simple();
    }
  },
  {
    version: 2,
    up: async () => {
      console.log('Running migration 2: Add emailed and archived columns to entries');
      await sql`ALTER TABLE entries ADD COLUMN emailed INTEGER DEFAULT 0`.simple();
      await sql`ALTER TABLE entries ADD COLUMN archived INTEGER DEFAULT 0`.simple();
    }
  },
  {
    version: 3,
    up: async () => {
      console.log('Running migration 3: Create configuration table');
      await sql`
        CREATE TABLE IF NOT EXISTS configuration (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `.simple();
    }
  }
];

async function getDBVersion(): Promise<number> {
  // Check if _db_version table exists
  const tables = await sql`
    SELECT name FROM sqlite_master WHERE type='table' AND name='_db_version'
  `.values();

  if (tables.length === 0) {
    // Missing _db_version table = blank database
    console.log('No _db_version table found, creating...');
    await sql`
      CREATE TABLE _db_version (
        version INTEGER PRIMARY KEY
      )
    `.simple();
    return 0;
  } else {
    // _db_version exists, check current version
    const versionResult = await sql`SELECT MAX(version) as max_version FROM _db_version`.values();
    if (versionResult.length > 0 && versionResult[0][0] !== null) {
      return versionResult[0][0] as number;
    }

    // Empty _db_version table = initial table already created, we're version 1
    return 1;
  }
}

export async function runMigrations(): Promise<void> {
  const currentVersion = await getDBVersion();
  console.log(`Current database version: ${currentVersion}`);

  // Run migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await migration.up();
      await sql`INSERT INTO _db_version (version) VALUES (${migration.version})`;
      console.log(`Migration ${migration.version} completed`);
    }
  }

  console.log('All migrations complete');
}
