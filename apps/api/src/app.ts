import { readFileSync } from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { createClient, findClientByToken } from "./clients";
import type { Db } from "./db";
import { buildDigest } from "./digest";
import type { Env } from "./env";
import { closeJobs, ingestBody, ingestJobs } from "./ingest";
import { allJobsForSitemap, getJob, listJobs, recentJobs } from "./jobs";
import { jobDescriptionSnippet, jobPostingLd, renderShell, sitemapXml } from "./seo";
import { LABELS, VOCAB } from "./vocab";

declare module "fastify" {
  interface FastifyRequest {
    ingestClient?: { id: number; name: string };
  }
}

const SITE_NAME = "IAPro Vagas";
const SITE_DESCRIPTION = "Vagas de tecnologia publicadas nos últimos dias, atualizadas todo dia, para a comunidade IAPro.";

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function sameSecret(a: string, b: string) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp(db: Db, env: Env) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
  await app.register(rateLimit, { global: false });

  const requireClient = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(req);
    const client = token ? await findClientByToken(db, token) : null;
    if (!client) return reply.code(401).send({ error: "token inválido" });
    req.ingestClient = client;
  };
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!sameSecret(bearer(req) ?? "", env.adminToken)) return reply.code(401).send({ error: "não autorizado" });
  };
  const ingestLimit = {
    rateLimit: { max: 60, timeWindow: "1 hour", keyGenerator: (req: FastifyRequest) => bearer(req) ?? req.ip },
  };

  app.get("/health", async () => {
    await db.query("SELECT 1");
    return { ok: true };
  });

  // ---- API de ingestão (agente de coleta) ----
  app.post("/api/v1/ingest/jobs", { preHandler: requireClient, config: ingestLimit, bodyLimit: 15 * 1024 * 1024 }, async (req, reply) => {
    const body = ingestBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande { jobs: [...] } com 1 a 200 vagas" });
    return { results: await ingestJobs(db, req.ingestClient!.id, body.data.jobs, env.publicUrl) };
  });

  const closeBody = z.object({ source: z.object({ kind: z.string().min(1) }), externalIds: z.array(z.string().min(1)).min(1).max(1000) });
  app.post("/api/v1/ingest/jobs/close", { preHandler: requireClient, config: ingestLimit }, async (req, reply) => {
    const body = closeBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande { source: { kind }, externalIds: [...] }" });
    return { closed: await closeJobs(db, body.data.source.kind, body.data.externalIds) };
  });

  app.get("/api/v1/ingest/runs", { preHandler: requireClient }, async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit) || 20, 100);
    const { rows } = await db.query(
      `SELECT id, created_at AS "createdAt", received, created, updated, rejected, errors
       FROM ingest_run WHERE client_id = $1 ORDER BY id DESC LIMIT $2`,
      [req.ingestClient!.id, limit],
    );
    return { runs: rows };
  });

  app.get("/api/v1/ingest/vocab", async () => ({ ...VOCAB, labels: LABELS }));

  // ---- Admin ----
  app.post("/api/v1/admin/clients", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande { name }" });
    return createClient(db, body.data.name);
  });

  app.get("/api/v1/admin/digest", { preHandler: requireAdmin }, async (req) => {
    const hours = Math.min(Math.max(Number((req.query as { hours?: string }).hours) || 24, 1), 168);
    const jobs = await recentJobs(db, hours);
    return { count: jobs.length, text: buildDigest(jobs, env.publicUrl) };
  });

  app.delete("/api/v1/admin/jobs/:code", { preHandler: requireAdmin }, async (req) => {
    const { rowCount } = await db.query("DELETE FROM job WHERE code = $1", [(req.params as { code: string }).code]);
    return { deleted: rowCount ?? 0 };
  });

  const adBody = z.object({
    title: z.string().trim().min(1).max(80),
    text: z.string().trim().max(200).optional(),
    cta: z.string().trim().max(30).optional(),
    url: z.url({ protocol: /^https?$/ }),
    endsAt: z.iso.datetime({ offset: true }).optional(),
  });
  app.post("/api/v1/admin/ads", { preHandler: requireAdmin }, async (req, reply) => {
    const body = adBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande { title, url } (text, cta e endsAt são opcionais)" });
    const { title, text, cta, url, endsAt } = body.data;
    const { rows } = await db.query(
      "INSERT INTO ad (title, text, cta, url, ends_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [title, text ?? null, cta ?? null, url, endsAt ?? null],
    );
    return rows[0];
  });

  app.get("/api/v1/admin/ads", { preHandler: requireAdmin }, async () => {
    const { rows } = await db.query(`SELECT id, title, text, cta, url, active, ends_at AS "endsAt" FROM ad ORDER BY id DESC`);
    return { ads: rows };
  });

  app.delete("/api/v1/admin/ads/:id", { preHandler: requireAdmin }, async (req) => {
    const { rowCount } = await db.query("UPDATE ad SET active = false WHERE id = $1", [Number((req.params as { id: string }).id) || 0]);
    return { disabled: rowCount ?? 0 };
  });

  // ---- API pública (site) ----
  const listQuery = z.object({
    q: z.string().max(100).optional(),
    workplace: z.string().optional(),
    seniority: z.string().optional(),
    regime: z.string().optional(),
    salary: z.enum(["1", "true"]).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  });
  app.get("/api/v1/jobs", async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "filtro inválido" });
    reply.header("cache-control", "public, max-age=30");
    return listJobs(db, { ...q.data, salary: !!q.data.salary, pageSize: 24 });
  });

  app.get("/api/v1/ads", async (_req, reply) => {
    const { rows } = await db.query(
      `SELECT id, title, text, cta, url FROM ad
       WHERE active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) ORDER BY id`,
    );
    reply.header("cache-control", "public, max-age=300");
    return { ads: rows };
  });

  app.get("/api/v1/jobs/:code", async (req, reply) => {
    const job = await getJob(db, { code: (req.params as { code: string }).code });
    if (!job) return reply.code(404).send({ error: "vaga não encontrada ou expirada" });
    reply.header("cache-control", "public, max-age=60");
    return job;
  });

  // ---- Páginas ----
  app.get("/v/:code", async (req, reply) => {
    const job = await getJob(db, { code: (req.params as { code: string }).code });
    return job ? reply.redirect(`/vagas/${job.slug}`, 301) : reply.redirect("/", 302);
  });

  app.get("/robots.txt", async (_req, reply) =>
    reply.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${env.publicUrl}/sitemap.xml\n`),
  );

  app.get("/sitemap.xml", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=600");
    return reply.type("application/xml").send(sitemapXml(env.publicUrl, await allJobsForSitemap(db)));
  });

  if (env.webDist) {
    const dist = path.resolve(env.webDist);
    const shell = readFileSync(path.join(dist, "index.html"), "utf8");
    await app.register(fastifyStatic, {
      root: dist,
      index: false,
      wildcard: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("cache-control", "public, max-age=31536000, immutable");
      },
    });
    // fastify-static sem wildcard só registra os arquivos que existem no boot; o resto cai nas rotas abaixo.

    const home = renderShell(shell, { title: `Vagas de tecnologia | ${SITE_NAME}`, description: SITE_DESCRIPTION, canonical: `${env.publicUrl}/` });
    app.get("/", async (_req, reply) => reply.header("cache-control", "public, max-age=60").type("text/html").send(home));

    app.get("/vagas/:slug", async (req, reply) => {
      const job = await getJob(db, { slug: (req.params as { slug: string }).slug });
      if (!job) {
        const gone = renderShell(shell, { title: `Vaga encerrada | ${SITE_NAME}`, description: SITE_DESCRIPTION, canonical: `${env.publicUrl}/`, noindex: true });
        return reply.code(410).type("text/html").send(gone);
      }
      const html = renderShell(shell, {
        title: `${job.title}${job.company ? ` · ${job.company}` : ""} | ${SITE_NAME}`,
        description: jobDescriptionSnippet(job),
        canonical: `${env.publicUrl}/vagas/${job.slug}`,
        jsonLd: jobPostingLd(job, env.publicUrl),
      });
      return reply.header("cache-control", "public, max-age=60").type("text/html").send(html);
    });

    const fallback = renderShell(shell, { title: SITE_NAME, description: SITE_DESCRIPTION, canonical: `${env.publicUrl}/`, noindex: true });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/") && !path.extname(req.url.split("?")[0]!)) {
        return reply.type("text/html").send(fallback);
      }
      return reply.code(404).send({ error: "não encontrado" });
    });
  }

  return app;
}
