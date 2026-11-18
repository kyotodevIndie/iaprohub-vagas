import { buildApp } from "./app";
import { createPool, runMigrations } from "./db";
import { env } from "./env";
import { expireJobs } from "./ingest";

const db = createPool(env.databaseUrl);
await runMigrations(db);
const app = await buildApp(db, env);

// Expiração: vagas com mais de 21 dias na plataforma saem do ar. Roda no boot e a cada hora.
const expire = () =>
  expireJobs(db)
    .then((n) => n && app.log.info(`expiração: ${n} vagas apagadas`))
    .catch((err) => app.log.error(err, "falha na expiração"));
await expire();
const timer = setInterval(expire, 60 * 60 * 1000);

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.port, host: "0.0.0.0" });
