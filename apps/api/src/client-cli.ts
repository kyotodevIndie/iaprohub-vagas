import { createClient } from "./clients";
import { createPool } from "./db";
import { env } from "./env";

const name = process.argv[2];
if (!name) {
  console.error("uso: pnpm client:create <nome-do-agente>");
  process.exit(1);
}
const db = createPool(env.databaseUrl);
const c = await createClient(db, name);
console.log(`cliente "${c.name}" criado (id ${c.id}). Token (guarde, não aparece de novo):\n${c.token}`);
await db.end();
