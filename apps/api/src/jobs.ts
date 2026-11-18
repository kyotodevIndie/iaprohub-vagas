import type { Db } from "./db";
import { fold } from "./text";
import { VOCAB } from "./vocab";

export interface JobRow {
  code: string;
  slug: string;
  source_kind: string;
  title: string;
  company_name: string | null;
  company_website: string | null;
  description: string | null;
  seniority: string[];
  workplace: string[];
  regime: string[];
  stack: string[];
  location: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_text: string | null;
  apply_url: string;
  published_at: Date | null;
  first_seen_at: Date;
}

export interface PublicJob {
  code: string;
  slug: string;
  source: string;
  title: string;
  company: string | null;
  companyWebsite: string | null;
  description: string | null;
  seniority: string[];
  workplace: string[];
  regime: string[];
  stack: string[];
  location: string | null;
  salary: string | null;
  applyUrl: string;
  publishedAt: string;
  expiresAt: string;
}

const COLS = `code, slug, source_kind, title, company_name, company_website, description, seniority, workplace, regime,
  stack, location, salary_min, salary_max, salary_currency, salary_period, salary_text, apply_url, published_at, first_seen_at`;

const PERIOD_SUFFIX: Record<string, string> = { hour: "/h", day: "/dia", month: "", year: "/ano" };
const CURRENCY: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€" };

function money(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(".", ",")} mil`;
  }
  return String(Math.round(n));
}

/** "R$ 12–15 mil", "US$ 5 mil", "a partir de R$ 8 mil/ano" ou o texto livre que o agente mandou. */
export function formatSalary(r: Pick<JobRow, "salary_min" | "salary_max" | "salary_currency" | "salary_period" | "salary_text">): string | null {
  if (r.salary_text) return r.salary_text;
  const min = r.salary_min === null ? null : Number(r.salary_min);
  const max = r.salary_max === null ? null : Number(r.salary_max);
  if (min === null && max === null) return null;
  const cur = CURRENCY[r.salary_currency ?? "BRL"] ?? r.salary_currency ?? "R$";
  const suffix = PERIOD_SUFFIX[r.salary_period ?? "month"] ?? "";
  if (min !== null && max !== null && min !== max) {
    const [a, b] = [money(min), money(max)];
    const range = a.endsWith(" mil") && b.endsWith(" mil") ? `${a.replace(" mil", "")}–${b}` : `${a}–${b}`;
    return `${cur} ${range}${suffix}`;
  }
  if (min !== null && max === null) return `a partir de ${cur} ${money(min)}${suffix}`;
  return `${cur} ${money((max ?? min)!)}${suffix}`;
}

export function toPublic(r: JobRow, expireDays = 21): PublicJob {
  return {
    code: r.code,
    slug: r.slug,
    source: r.source_kind,
    title: r.title,
    company: r.company_name,
    companyWebsite: r.company_website,
    description: r.description,
    seniority: r.seniority,
    workplace: r.workplace,
    regime: r.regime,
    stack: r.stack,
    location: r.location,
    salary: formatSalary(r),
    applyUrl: r.apply_url,
    publishedAt: (r.published_at ?? r.first_seen_at).toISOString(),
    expiresAt: new Date(r.first_seen_at.getTime() + expireDays * 86_400_000).toISOString(),
  };
}

export interface ListFilters {
  q?: string;
  workplace?: string;
  seniority?: string;
  regime?: string;
  salary?: boolean;
  page: number;
  pageSize: number;
}

export async function listJobs(db: Db, f: ListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("$?", `$${params.length}`));
  };
  if (f.q) for (const term of fold(f.q).split(" ").filter(Boolean).slice(0, 6)) add("search_text LIKE $?", `%${term.replace(/[%_\\]/g, "\\$&")}%`);
  if (f.workplace && (VOCAB.workplace as readonly string[]).includes(f.workplace)) add("$? = ANY(workplace)", f.workplace);
  if (f.seniority && (VOCAB.seniority as readonly string[]).includes(f.seniority)) add("$? = ANY(seniority)", f.seniority);
  if (f.regime && (VOCAB.regime as readonly string[]).includes(f.regime)) add("$? = ANY(regime)", f.regime);
  if (f.salary) where.push("(salary_min IS NOT NULL OR salary_max IS NOT NULL OR salary_text IS NOT NULL)");
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = await db.query<{ n: string }>(`SELECT count(*) AS n FROM job ${w}`, params);
  const { rows } = await db.query<JobRow>(
    `SELECT ${COLS} FROM job ${w} ORDER BY coalesce(published_at, first_seen_at) DESC, id DESC
     LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    params,
  );
  return { items: rows.map((r) => toPublic(r)), total: Number(total.rows[0]!.n), page: f.page, pageSize: f.pageSize };
}

export async function getJob(db: Db, by: { code?: string; slug?: string }) {
  const { rows } = by.code
    ? await db.query<JobRow>(`SELECT ${COLS} FROM job WHERE code = $1`, [by.code])
    : await db.query<JobRow>(`SELECT ${COLS} FROM job WHERE slug = $1`, [by.slug]);
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function recentJobs(db: Db, hours: number, limit = 500) {
  const { rows } = await db.query<JobRow>(
    `SELECT ${COLS} FROM job WHERE first_seen_at > now() - make_interval(hours => $1)
     ORDER BY first_seen_at DESC LIMIT $2`,
    [hours, limit],
  );
  return rows.map((r) => toPublic(r));
}

/** Vagas que chegaram depois de `since`, mais novas primeiro. */
export async function jobsSince(db: Db, since: Date, limit = 500) {
  const { rows } = await db.query<JobRow>(`SELECT ${COLS} FROM job WHERE first_seen_at > $1 ORDER BY first_seen_at DESC LIMIT $2`, [
    since,
    limit,
  ]);
  return rows.map((r) => toPublic(r));
}

export async function allJobsForSitemap(db: Db) {
  const { rows } = await db.query<{ slug: string; updated_at: Date }>("SELECT slug, updated_at FROM job ORDER BY id DESC LIMIT 45000");
  return rows;
}
