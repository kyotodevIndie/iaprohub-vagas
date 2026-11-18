import type { Db } from "./db";
import { LABELS } from "./vocab";
import type { Mailer } from "./mail";

// Envio automático do Pro (docs/talentos.md). Três passos, rodados pelo worker a cada 5 minutos:
// 1. matchNewJobs: cada vaga nova casa com os perfis Pro e vira linhas pendentes em `application`;
// 2. sendApplications: as do canal "email" vão para o recrutador, com o CV anexo (até 5 por pessoa por dia);
// 3. sendDailyAlerts: as do canal "alerta" saem num e-mail só por pessoa, a partir das 9h de Brasília.

export const DAILY_SEND_LIMIT = 5;
const ALERT_HOUR_BRT = 9;

/**
 * Casa as vagas ainda não processadas com os perfis Pro. Uma vaga casa quando há pelo menos 1 tecnologia em comum
 * e a senioridade, o modelo de trabalho e o salário (só em BRL/mês) não conflitam. Vai pelo canal "email" quando
 * a vaga tem applyEmail e a pessoa autorizou o envio e tem CV; senão, pelo alerta (se ela quer alertas).
 */
export async function matchNewJobs(db: Db): Promise<number> {
  const { rowCount } = await db.query(`
    WITH js AS (
      UPDATE job SET matched_at = now()
      WHERE id IN (SELECT id FROM job WHERE matched_at IS NULL ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED)
      RETURNING id, code, title, company_name, apply_url, apply_email, seniority, workplace, stack,
        CASE WHEN salary_currency = 'BRL' AND salary_period = 'month' THEN coalesce(salary_max, salary_min) END AS salary_month
    ), m AS (
      SELECT js.*, p.user_id,
        (js.apply_email IS NOT NULL AND p.consent_auto_apply AND p.cv_pdf IS NOT NULL) AS by_email,
        p.consent_alerts
      FROM js
      JOIN talent_profile p ON p.stack && js.stack
      JOIN app_user u ON u.id = p.user_id AND u.billing_access
      WHERE (cardinality(js.seniority) = 0 OR cardinality(p.seniority) = 0 OR p.seniority && js.seniority)
        AND (cardinality(js.workplace) = 0 OR cardinality(p.workplace) = 0 OR p.workplace && js.workplace)
        AND (p.salary_min IS NULL OR js.salary_month IS NULL OR js.salary_month >= p.salary_min)
    )
    INSERT INTO application (user_id, job_id, job_code, job_title, company_name, apply_url, channel, to_email, status)
    SELECT user_id, id, code, title, company_name, apply_url,
      CASE WHEN by_email THEN 'email' ELSE 'alerta' END, CASE WHEN by_email THEN apply_email END, 'pendente'
    FROM m WHERE by_email OR consent_alerts
    ON CONFLICT (user_id, job_code) DO NOTHING`);
  return rowCount ?? 0;
}

interface PendingSend {
  id: number;
  user_id: number;
  job_title: string;
  company_name: string | null;
  to_email: string;
  email: string;
  name: string | null;
  phone: string | null;
  linkedin: string | null;
  headline: string | null;
  seniority: string[];
  stack: string[];
  summary: string | null;
  cv_pdf: Buffer;
  cv_filename: string | null;
  sent_today: number;
}

const startOfDayBrt = `(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`;

export function applicationMail(a: Omit<PendingSend, "id" | "user_id" | "cv_pdf" | "sent_today" | "to_email">) {
  const who = a.name || a.email;
  const profile = [a.headline, a.seniority.map((s) => LABELS[s] ?? s).join("/"), a.stack.slice(0, 12).join(", ")].filter(Boolean);
  const contact = [`E-mail: ${a.email}`, a.phone && `Telefone: ${a.phone}`, a.linkedin && `LinkedIn: ${a.linkedin}`].filter(Boolean);
  return {
    subject: `Candidatura: ${a.job_title} · ${who}`,
    paragraphs: [
      "Olá!",
      `${who} tem interesse na vaga ${a.job_title}${a.company_name ? ` da ${a.company_name}` : ""} e enviou o currículo em anexo pelo IAPro Vagas.`,
      ...(profile.length ? [profile.join(" · ")] : []),
      ...(a.summary ? [a.summary.length > 800 ? `${a.summary.slice(0, 799)}…` : a.summary] : []),
      contact.join("\n"),
      "Para falar com a pessoa, é só responder este e-mail.",
    ],
  };
}

/** Manda as candidaturas por e-mail. Passou do limite do dia, a vaga vai para o alerta. Pessoa que perdeu o Pro ou a autorização, a linha é descartada. */
export async function sendApplications(db: Db, mail: Mailer): Promise<number> {
  await db.query(
    `DELETE FROM application a USING app_user u, talent_profile p
     WHERE a.status = 'pendente' AND a.channel = 'email' AND u.id = a.user_id AND p.user_id = a.user_id
       AND (NOT u.billing_access OR NOT p.consent_auto_apply OR p.cv_pdf IS NULL)`,
  );
  const { rows } = await db.query<PendingSend>(
    `SELECT a.id::int AS id, a.user_id::int AS user_id, a.job_title, a.company_name, a.to_email,
       u.email, p.name, p.phone, p.linkedin, p.headline, p.seniority, p.stack, p.summary, p.cv_pdf, p.cv_filename,
       (SELECT count(*)::int FROM application s WHERE s.user_id = a.user_id AND s.channel = 'email'
          AND s.status = 'enviado' AND s.sent_at >= ${startOfDayBrt}) AS sent_today
     FROM application a JOIN app_user u ON u.id = a.user_id JOIN talent_profile p ON p.user_id = a.user_id
     WHERE a.status = 'pendente' AND a.channel = 'email' ORDER BY a.id LIMIT 100`,
  );
  const sentNow = new Map<number, number>();
  let sent = 0;
  for (const a of rows) {
    const today = a.sent_today + (sentNow.get(a.user_id) ?? 0);
    if (today >= DAILY_SEND_LIMIT) {
      await db.query("UPDATE application SET channel = 'alerta', to_email = NULL WHERE id = $1", [a.id]);
      continue;
    }
    const m = applicationMail(a);
    try {
      await mail({
        to: a.to_email,
        subject: m.subject,
        paragraphs: m.paragraphs,
        replyTo: a.email,
        attachments: [{ filename: a.cv_filename || "curriculo.pdf", content: a.cv_pdf }],
      });
      await db.query("UPDATE application SET status = 'enviado', sent_at = now() WHERE id = $1", [a.id]);
      sentNow.set(a.user_id, (sentNow.get(a.user_id) ?? 0) + 1);
      sent++;
    } catch (err) {
      await db.query("UPDATE application SET status = 'falhou', error = $2 WHERE id = $1", [a.id, (err as Error).message.slice(0, 300)]);
    }
  }
  return sent;
}

/** Um e-mail por pessoa com as vagas do alerta e os envios do dia. Só a partir das 9h de Brasília, uma vez por dia. */
export async function sendDailyAlerts(db: Db, mail: Mailer, publicUrl: string, now = new Date()): Promise<number> {
  const hourBrt = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hourBrt < ALERT_HOUR_BRT) return 0;
  await db.query(
    `DELETE FROM application a USING app_user u, talent_profile p
     WHERE a.status = 'pendente' AND a.channel = 'alerta' AND u.id = a.user_id AND p.user_id = a.user_id
       AND (NOT u.billing_access OR NOT p.consent_alerts)`,
  );
  const users = await db.query<{ id: number; email: string }>(
    `SELECT DISTINCT u.id::int AS id, u.email FROM application a JOIN app_user u ON u.id = a.user_id
     WHERE a.status = 'pendente' AND a.channel = 'alerta' AND (u.last_alert_at IS NULL OR u.last_alert_at < ${startOfDayBrt})`,
  );
  let count = 0;
  for (const u of users.rows) {
    const items = await db.query<{ id: number; job_code: string; job_title: string; company_name: string | null }>(
      `SELECT id::int AS id, job_code, job_title, company_name FROM application
       WHERE user_id = $1 AND status = 'pendente' AND channel = 'alerta' ORDER BY id LIMIT 30`,
      [u.id],
    );
    const sent = await db.query<{ job_title: string; company_name: string | null }>(
      `SELECT job_title, company_name FROM application
       WHERE user_id = $1 AND channel = 'email' AND status = 'enviado' AND sent_at > now() - interval '1 day' ORDER BY id`,
      [u.id],
    );
    const line = (t: string, c: string | null) => `${t}${c ? ` · ${c}` : ""}`;
    const paragraphs = [
      `${items.rows.length} ${items.rows.length === 1 ? "vaga nova bate" : "vagas novas batem"} com o seu perfil. Para se candidatar, abra cada uma:`,
      items.rows.map((i) => `• ${line(i.job_title, i.company_name)}\n  ${publicUrl}/v/${i.job_code}`).join("\n"),
    ];
    if (sent.rows.length) {
      paragraphs.push(`Seu currículo foi enviado automaticamente para:\n${sent.rows.map((s) => `• ${line(s.job_title, s.company_name)}`).join("\n")}`);
    }
    try {
      await mail({
        to: u.email,
        subject: "Vagas para você hoje · IAPro Vagas",
        paragraphs,
        action: { label: "Ver minha conta", url: `${publicUrl}/conta` },
      });
      await db.query("UPDATE application SET status = 'enviado', sent_at = now() WHERE id = ANY($1)", [items.rows.map((i) => i.id)]);
      await db.query("UPDATE app_user SET last_alert_at = now() WHERE id = $1", [u.id]);
      count++;
    } catch {
      /* tenta de novo na próxima rodada */
    }
  }
  return count;
}
