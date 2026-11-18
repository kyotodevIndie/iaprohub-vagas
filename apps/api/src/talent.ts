import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import { toVocab } from "./vocab";

export const POLICY_VERSION = "2026-11-18";

const vocab = (kind: "seniority" | "workplace") =>
  z
    .array(z.string())
    .max(10)
    .default([])
    .transform((l) => [...new Set(l.map((v) => toVocab(kind, v)).filter((v): v is string => !!v))]);

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const profileInput = z.object({
  name: optText(120),
  phone: optText(30),
  linkedin: z.union([z.url({ protocol: /^https?$/ }).max(300), z.literal("")]).nullish().transform((v) => v || null),
  headline: optText(120),
  currentCompany: optText(120),
  summary: optText(2000),
  region: optText(80),
  seniority: vocab("seniority"),
  workplace: vocab("workplace"),
  stack: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .default([])
    .transform((l) => [...new Set(l.map((s) => s.toLowerCase()))]),
  salaryMin: z.number().nonnegative().max(1_000_000).nullish().transform((v) => v ?? null),
  visibility: z.enum(["oculto", "anonimo", "aberto"]).default("oculto"),
  consents: z.object({ talentBank: z.boolean(), autoApply: z.boolean(), alerts: z.boolean() }),
});

export type ProfileInput = z.infer<typeof profileInput>;

const PROFILE_COLS = `public_id AS "publicId", name, phone, linkedin, headline, current_company AS "currentCompany", summary,
  region, seniority, workplace, stack, salary_min::float AS "salaryMin", visibility,
  consent_talent_bank AS "talentBank", consent_auto_apply AS "autoApply", consent_alerts AS "alerts",
  cv_filename AS "cvFilename", cv_updated_at AS "cvUpdatedAt", updated_at AS "updatedAt"`;

export async function getProfile(db: Db, userId: number) {
  const { rows } = await db.query(`SELECT ${PROFILE_COLS} FROM talent_profile WHERE user_id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  const { talentBank, autoApply, alerts, ...rest } = r;
  return { ...rest, consents: { talentBank, autoApply, alerts } };
}

export async function logConsent(db: Db, userId: number, purpose: string, granted: boolean, ipHash: string | null) {
  await db.query("INSERT INTO consent_log (user_id, purpose, granted, policy_version, ip_hash) VALUES ($1,$2,$3,$4,$5)", [
    userId,
    purpose,
    granted,
    POLICY_VERSION,
    ipHash,
  ]);
}

/** Salva o perfil e registra no consent_log só o consentimento que mudou. Sem o aceite do banco, o perfil fica oculto. */
export async function saveProfile(db: Db, userId: number, p: ProfileInput, ipHash: string | null) {
  const before = await db.query<{ talent_bank: boolean; auto_apply: boolean; alerts: boolean }>(
    "SELECT consent_talent_bank AS talent_bank, consent_auto_apply AS auto_apply, consent_alerts AS alerts FROM talent_profile WHERE user_id = $1",
    [userId],
  );
  const old = before.rows[0] ?? { talent_bank: false, auto_apply: false, alerts: false };
  const visibility = p.consents.talentBank ? p.visibility : "oculto";
  await db.query(
    `INSERT INTO talent_profile (user_id, public_id, name, phone, linkedin, headline, current_company, summary, region,
       seniority, workplace, stack, salary_min, visibility, consent_talent_bank, consent_auto_apply, consent_alerts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, linkedin = EXCLUDED.linkedin,
       headline = EXCLUDED.headline, current_company = EXCLUDED.current_company, summary = EXCLUDED.summary,
       region = EXCLUDED.region, seniority = EXCLUDED.seniority, workplace = EXCLUDED.workplace, stack = EXCLUDED.stack,
       salary_min = EXCLUDED.salary_min, visibility = EXCLUDED.visibility,
       consent_talent_bank = EXCLUDED.consent_talent_bank, consent_auto_apply = EXCLUDED.consent_auto_apply,
       consent_alerts = EXCLUDED.consent_alerts, updated_at = now()`,
    [
      userId,
      randomBytes(6).toString("base64url"),
      p.name,
      p.phone,
      p.linkedin,
      p.headline,
      p.currentCompany,
      p.summary,
      p.region,
      p.seniority,
      p.workplace,
      p.stack,
      p.salaryMin,
      visibility,
      p.consents.talentBank,
      p.consents.autoApply,
      p.consents.alerts,
    ],
  );
  const changes: [string, boolean, boolean][] = [
    ["banco_talentos", old.talent_bank, p.consents.talentBank],
    ["envio_automatico", old.auto_apply, p.consents.autoApply],
    ["alertas", old.alerts, p.consents.alerts],
  ];
  for (const [purpose, was, now] of changes) if (was !== now) await logConsent(db, userId, purpose, now, ipHash);
  return getProfile(db, userId);
}

/** O CV só pode ser salvo depois do perfil existir (o perfil cria o public_id). */
export async function saveCv(db: Db, userId: number, pdf: Buffer, filename: string) {
  const { rowCount } = await db.query(
    "UPDATE talent_profile SET cv_pdf = $2, cv_filename = $3, cv_updated_at = now(), updated_at = now() WHERE user_id = $1",
    [userId, pdf, filename],
  );
  return (rowCount ?? 0) > 0;
}

export async function listApplications(db: Db, userId: number) {
  const { rows } = await db.query(
    `SELECT job_code AS "jobCode", job_title AS "jobTitle", company_name AS company, apply_url AS "applyUrl", channel,
       to_email AS "toEmail", status, created_at AS "createdAt", sent_at AS "sentAt"
     FROM application WHERE user_id = $1 ORDER BY id DESC LIMIT 100`,
    [userId],
  );
  return rows;
}

// ---- Recrutadores ----

export const talentSearch = z.object({
  q: z.string().trim().max(100).optional(),
  seniority: z.string().optional(),
  workplace: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

/** Perfis que aceitaram o banco de talentos. Anônimo: sem nome, contato nem empresa; aberto: com empresa e LinkedIn. */
export async function searchTalents(db: Db, f: z.infer<typeof talentSearch>) {
  const where = ["p.consent_talent_bank", "p.visibility <> 'oculto'"];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("$?", `$${args.length}`));
  };
  for (const term of (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
    args.push(term);
    const n = `$${args.length}`;
    where.push(
      `(p.stack @> ARRAY[${n}]::text[] OR strpos(lower(coalesce(p.headline,'') || ' ' || coalesce(p.summary,'')), ${n}) > 0)`,
    );
  }
  const sen = f.seniority && toVocab("seniority", f.seniority);
  if (sen) add("p.seniority @> ARRAY[$?]::text[]", sen);
  const wp = f.workplace && toVocab("workplace", f.workplace);
  if (wp) add("p.workplace @> ARRAY[$?]::text[]", wp);
  const pageSize = 20;
  const { rows } = await db.query(
    `SELECT p.public_id AS id, p.headline, p.seniority, p.workplace, p.stack, p.region, p.summary,
       p.salary_min::float AS "salaryMin", p.visibility, u.billing_access AS pro,
       CASE WHEN p.visibility = 'aberto' THEN p.current_company END AS "currentCompany",
       CASE WHEN p.visibility = 'aberto' THEN p.linkedin END AS linkedin,
       count(*) OVER()::int AS total
     FROM talent_profile p JOIN app_user u ON u.id = p.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY u.billing_access DESC, p.updated_at DESC
     LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`,
    args,
  );
  return { total: rows[0]?.total ?? 0, items: rows.map(({ total: _t, ...r }) => r) };
}
