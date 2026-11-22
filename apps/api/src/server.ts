import { buildApp } from "./app";
import { createPool, runMigrations } from "./db";
import { env } from "./env";
import { expireJobs } from "./ingest";
import { createMailer } from "./mail";
import { matchNewJobs, sendApplications, sendDailyAlerts } from "./matching";
import { createWhatsApp, msUntilNext, sendDigest } from "./whatsapp";

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

// A cada 5 minutos, sem rodadas sobrepostas: envio automático do Pro (casa vagas novas, manda os CVs e o alerta
// diário) e o resumo diário no grupo do WhatsApp.
const mailer = createMailer(env, (m) => app.log.info(m));
const wa = env.evolution ? createWhatsApp(env.evolution) : null;
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

// Resumo do WhatsApp: um timer para o próximo horário de DIGEST_TIMES. Ao subir, manda o horário que passou
// enquanto o servidor estava fora (cada horário sai uma vez só).
let digestTimer: NodeJS.Timeout | undefined;
const digest = async () => {
  const sent = await sendDigest(db, wa!, env.publicUrl, env.evolution!.digestTimes).catch((err) => {
    app.log.error(err, "falha no resumo do WhatsApp");
    return null;
  });
  if (sent) app.log.info(sent, "resumo do WhatsApp");
  digestTimer = setTimeout(digest, msUntilNext(env.evolution!.digestTimes) + 1000);
};
if (wa && env.evolution!.digestTimes.length) setTimeout(digest, 15_000);

const shutdown = async () => {
  clearInterval(timer);
  clearInterval(proTimer);
  clearTimeout(digestTimer);
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.port, host: "0.0.0.0" });
