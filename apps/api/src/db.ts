import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export type Db = pg.Pool;

// numeric chega como string; o resto dos tipos usa o padrão do pg (timestamptz → Date).
export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Roda cada arquivo de migrations/ uma vez só, em ordem de nome, registrando em schema_migrations. */
export async function runMigrations(db: Db, log: (m: string) => void = console.log) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const done = await db.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (done.rowCount) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      log(`migration aplicada: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`falha na migration ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
