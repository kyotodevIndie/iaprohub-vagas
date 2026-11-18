import { z } from "zod";
import type { Db } from "./db";
import { fold, shortCode, slugify } from "./text";
import { toVocab, VOCAB } from "./vocab";

const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

const vocabList = (kind: keyof typeof VOCAB) =>
  z
    .array(z.string().max(40))
    .max(10)
    .default([])
    .transform((list, ctx) => {
      const out: string[] = [];
      for (const raw of list) {
        const v = toVocab(kind, raw);
        if (!v) ctx.addIssue({ code: "custom", message: `valor fora do vocabulário: "${raw}" (aceitos: ${VOCAB[kind].join(", ")})` });
        else if (!out.includes(v)) out.push(v);
      }
      return out;
    });

export const jobInput = z
  .object({
    source: z.object({
      kind: z.string().trim().min(1).max(40),
      key: z.string().trim().max(200).optional(),
      externalId: z.string().trim().min(1).max(300).optional(),
      url: httpUrl.optional(),
    }),
    title: z.string().trim().min(1).max(200),
    company: z.object({ name: z.string().trim().min(1).max(150), website: httpUrl.optional() }).optional(),
    description: z.string().max(50_000).optional(),
    seniority: vocabList("seniority"),
    workplace: vocabList("workplace"),
    regime: vocabList("regime"),
    stack: z
      .array(z.string().trim().min(1).max(40))
      .max(30)
      .default([])
      .transform((l) => [...new Set(l.map((s) => s.toLowerCase()))]),
    location: z.string().trim().max(150).optional(),
    salary: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().nonnegative().optional(),
        currency: z.string().trim().length(3).toUpperCase().default("BRL"),
        period: z.enum(VOCAB.salaryPeriod).default("month"),
        text: z.string().trim().max(80).optional(),
      })
      .refine((s) => s.min === undefined || s.max === undefined || s.min <= s.max, "salary.min maior que salary.max")
      .optional(),
    applyUrl: httpUrl,
    publishedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((j) => j.source.externalId || j.source.url, { message: "mande source.externalId ou source.url", path: ["source"] });

export type JobInput = z.infer<typeof jobInput>;

export const ingestBody = z.object({ jobs: z.array(z.unknown()).min(1).max(200) });

export type ItemResult =
  | { index: number; status: "created" | "updated"; id: string; url: string }
  | { index: number; status: "rejected"; errors: string[] };

function issuesToMessages(err: z.ZodError): string[] {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

export function searchText(j: JobInput): string {
  return fold([j.title, j.company?.name, j.location, ...j.stack].filter(Boolean).join(" "));
}

/** Grava (ou atualiza) cada vaga do lote. Um item inválido não derruba os outros. */
export async function ingestJobs(db: Db, clientId: number, items: unknown[], publicUrl: string) {
  const results: ItemResult[] = [];
  for (const [index, raw] of items.entries()) {
    const parsed = jobInput.safeParse(raw);
    if (!parsed.success) {
      results.push({ index, status: "rejected", errors: issuesToMessages(parsed.error) });
      continue;
    }
    const j = parsed.data;
    const code = shortCode();
    const slug = `${slugify([j.title, j.company?.name].filter(Boolean).join(" "))}-${code}`;
    const { rows } = await db.query<{ code: string; slug: string; inserted: boolean }>(
      `INSERT INTO job (code, slug, client_id, source_kind, source_key, external_id, source_url, title, company_name,
         company_website, description, seniority, workplace, regime, stack, location, salary_min, salary_max,
         salary_currency, salary_period, salary_text, apply_url, search_text, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (source_kind, external_id) DO UPDATE SET
         source_key = EXCLUDED.source_key, source_url = EXCLUDED.source_url, title = EXCLUDED.title,
         company_name = EXCLUDED.company_name, company_website = EXCLUDED.company_website,
         description = EXCLUDED.description, seniority = EXCLUDED.seniority, workplace = EXCLUDED.workplace,
         regime = EXCLUDED.regime, stack = EXCLUDED.stack, location = EXCLUDED.location,
         salary_min = EXCLUDED.salary_min, salary_max = EXCLUDED.salary_max,
         salary_currency = EXCLUDED.salary_currency, salary_period = EXCLUDED.salary_period,
         salary_text = EXCLUDED.salary_text, apply_url = EXCLUDED.apply_url,
         search_text = EXCLUDED.search_text, published_at = EXCLUDED.published_at, updated_at = now()
       RETURNING code, slug, (xmax = 0) AS inserted`,
      [
        code,
        slug,
        clientId,
        fold(j.source.kind),
        j.source.key ?? null,
        j.source.externalId ?? j.source.url!,
        j.source.url ?? null,
        j.title,
        j.company?.name ?? null,
        j.company?.website ?? null,
        j.description ?? null,
        j.seniority,
        j.workplace,
        j.regime,
        j.stack,
        j.location ?? null,
        j.salary?.min ?? null,
        j.salary?.max ?? null,
        j.salary ? j.salary.currency : null,
        j.salary ? j.salary.period : null,
        j.salary?.text ?? null,
        j.applyUrl,
        searchText(j),
        j.publishedAt ?? null,
      ],
    );
    const row = rows[0]!;
    results.push({
      index,
      status: row.inserted ? "created" : "updated",
      id: row.code,
      url: `${publicUrl}/vagas/${row.slug}`,
    });
  }

  const count = (s: ItemResult["status"]) => results.filter((r) => r.status === s).length;
  const errors = results.filter((r) => r.status === "rejected");
  await db.query(
    `INSERT INTO ingest_run (client_id, received, created, updated, rejected, errors) VALUES ($1,$2,$3,$4,$5,$6)`,
    [clientId, items.length, count("created"), count("updated"), count("rejected"), JSON.stringify(errors)],
  );
  await db.query("UPDATE ingest_client SET last_used_at = now() WHERE id = $1", [clientId]);
  return results;
}

/** Tira do ar vagas que fecharam na fonte antes dos 21 dias. */
export async function closeJobs(db: Db, sourceKind: string, externalIds: string[]) {
  const { rowCount } = await db.query("DELETE FROM job WHERE source_kind = $1 AND external_id = ANY($2)", [
    fold(sourceKind),
    externalIds,
  ]);
  return rowCount ?? 0;
}

/** Apaga as vagas com mais de 21 dias na plataforma. */
export async function expireJobs(db: Db, days = 21) {
  const { rowCount } = await db.query("DELETE FROM job WHERE first_seen_at < now() - make_interval(days => $1)", [days]);
  return rowCount ?? 0;
}
