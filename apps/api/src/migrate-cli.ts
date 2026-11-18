import { createPool, runMigrations } from "./db";
import { env } from "./env";

const db = createPool(env.databaseUrl);
await runMigrations(db);
await db.end();
