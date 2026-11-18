import { buildApp } from "./app";
import { createPool, runMigrations } from "./db";
import { env } from "./env";
import { expireJobs } from "./ingest";
import { createMailer } from "./mail";
import { matchNewJobs, sendApplications, sendDailyAlerts } from "./matching";

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

// Envio automático do Pro: casa vagas novas, manda os CVs e o alerta diário. A cada 5 minutos, sem rodadas sobrepostas.
const mailer = createMailer(env, (m) => app.log.info(m));
let busy = false;
const pro = async () => {
  if (busy) return;
  busy = true;
  try {
    const matched = await matchNewJobs(db);
    const sent = await sendApplications(db, mailer);
    const alerts = await sendDailyAlerts(db, mailer, env.publicUrl);
    if (matched || sent || alerts) app.log.info({ matched, sent, alerts }, "envio automático");
  } catch (err) {
    app.log.error(err, "falha no envio automático");
  } finally {
    busy = false;
  }
};
const proTimer = setInterval(pro, 5 * 60 * 1000);
setTimeout(pro, 10_000);

const shutdown = async () => {
  clearInterval(timer);
  clearInterval(proTimer);
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.port, host: "0.0.0.0" });
