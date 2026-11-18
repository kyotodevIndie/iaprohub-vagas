import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createPool, runMigrations, type Db } from "../src/db";
import { expireJobs } from "../src/ingest";

// Precisa de um Postgres de teste: `pnpm db:up` e o banco vagas_test (ver README). Sem ele, os testes são pulados.
const url = process.env.TEST_DATABASE_URL ?? "postgres://vagas:vagas@localhost:5442/vagas_test";
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const ADMIN = "admin-teste";

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";

const probe = createPool(url);
const available = await probe.query("SELECT 1").then(() => true, () => false);
await probe.end();

beforeAll(async () => {
  if (!available) return;
  db = createPool(url);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations(db, () => {});
  app = await buildApp(db, { databaseUrl: url, port: 0, publicUrl: "https://site.test", adminToken: ADMIN, webDist, adsense: { client: "ca-pub-1234567890123456", slot: "9876543210" } });
  const res = await app.inject({ method: "POST", url: "/api/v1/admin/clients", headers: { authorization: `Bearer ${ADMIN}` }, payload: { name: "gpt" } });
  token = res.json().token;
});

afterAll(async () => {
  await app?.close();
  await db?.end();
});

const job = (id: string, extra: Record<string, unknown> = {}) => ({
  source: { kind: "greenhouse", key: "acme", externalId: id },
  title: `Dev Back-end ${id}`,
  company: { name: "Acme" },
  description: "Node e Postgres. <b>sem html</b>",
  seniority: ["senior"],
  workplace: ["remoto"],
  regime: ["pj"],
  stack: ["node", "postgresql"],
  salary: { min: 12000, max: 15000 },
  applyUrl: `https://boards.greenhouse.io/acme/jobs/${id}`,
  ...extra,
});

describe.skipIf(!available)("API", () => {
  it("recusa ingestão sem token", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/ingest/jobs", payload: { jobs: [job("1")] } });
    expect(res.statusCode).toBe(401);
  });

  it("grava, atualiza e rejeita por item", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/jobs",
      headers: auth,
      payload: { jobs: [job("1"), job("2", { workplace: ["hibrido"], location: "São Paulo, SP", salary: undefined }), { title: "sem nada" }] },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json().results;
    expect(r.map((x: { status: string }) => x.status)).toEqual(["created", "created", "rejected"]);
    expect(r[0].url).toMatch(/^https:\/\/site\.test\/vagas\/dev-back-end-1-acme-[a-z2-9]{7}$/);

    const again = await app.inject({ method: "POST", url: "/api/v1/ingest/jobs", headers: auth, payload: { jobs: [job("1", { title: "Dev Back-end 1 (novo)" })] } });
    expect(again.json().results[0]).toMatchObject({ status: "updated", id: r[0].id });

    const runs = await app.inject({ url: "/api/v1/ingest/runs", headers: auth });
    expect(runs.json().runs[1]).toMatchObject({ received: 3, created: 2, rejected: 1 });
  });

  it("lista com busca e filtros", async () => {
    const all = (await app.inject({ url: "/api/v1/jobs" })).json();
    expect(all.total).toBe(2);
    expect((await app.inject({ url: "/api/v1/jobs?workplace=hibrido" })).json().total).toBe(1);
    expect((await app.inject({ url: "/api/v1/jobs?q=sao%20paulo" })).json().total).toBe(1);
    expect((await app.inject({ url: "/api/v1/jobs?q=POSTGRESQL&salary=1" })).json().total).toBe(1);
    const first = all.items.find((j: { title: string }) => j.title.includes("novo"));
    expect(first.salary).toBe("R$ 12–15 mil");
  });

  it("link curto, página com JSON-LD, sitemap e resumo", async () => {
    const [j] = (await app.inject({ url: "/api/v1/jobs?q=novo" })).json().items;
    const short = await app.inject({ url: `/v/${j.code}` });
    expect(short.statusCode).toBe(301);
    expect(short.headers.location).toBe(`/vagas/${j.slug}`);

    const page = await app.inject({ url: `/vagas/${j.slug}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('"@type":"JobPosting"');
    expect(page.body).toContain("<title>Dev Back-end 1 (novo) · Acme | IAPro Vagas</title>");
    expect((await app.inject({ url: "/vagas/nao-existe-abc" })).statusCode).toBe(410);
    expect((await app.inject({ url: "/sitemap.xml" })).body).toContain(`/vagas/${j.slug}`);
    expect((await app.inject({ url: "/admin/resumo" })).statusCode).toBe(200);

    expect((await app.inject({ url: "/api/v1/admin/digest" })).statusCode).toBe(401);
    const digest = (await app.inject({ url: "/api/v1/admin/digest", headers: { authorization: `Bearer ${ADMIN}` } })).json();
    expect(digest.count).toBe(2);
    expect(digest.text).toContain(`👉 https://site.test/v/${j.code}`);
  });

  it("anúncios: só admin cria, a rota pública lista os ativos", async () => {
    const admin = { authorization: `Bearer ${ADMIN}` };
    expect((await app.inject({ method: "POST", url: "/api/v1/admin/ads", payload: { title: "x", url: "https://x.com" } })).statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/api/v1/admin/ads", headers: admin, payload: { title: "Curso X", text: "Aprenda Y", url: "https://x.com" } });
    expect(created.statusCode).toBe(200);
    expect((await app.inject({ url: "/api/v1/ads" })).json().ads).toEqual([{ id: created.json().id, title: "Curso X", text: "Aprenda Y", cta: null, url: "https://x.com" }]);
    await app.inject({ method: "DELETE", url: `/api/v1/admin/ads/${created.json().id}`, headers: admin });
    expect((await app.inject({ url: "/api/v1/ads" })).json().ads).toEqual([]);
  });

  it("AdSense: ads.txt, script e slot nas páginas, página de privacidade", async () => {
    expect((await app.inject({ url: "/ads.txt" })).body).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
    const home = (await app.inject({ url: "/" })).body;
    expect(home).toContain('<meta name="google-adsense-account" content="ca-pub-1234567890123456">');
    expect(home).toContain('<meta name="iaprohub-adsense-slot" content="9876543210">');
    expect(home).toContain("adsbygoogle.js?client=ca-pub-1234567890123456");
    const privacy = await app.inject({ url: "/privacidade" });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.body).toContain("<title>Política de privacidade | IAPro Vagas</title>");
  });

  it("fecha e expira", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const closed = await app.inject({ method: "POST", url: "/api/v1/ingest/jobs/close", headers: auth, payload: { source: { kind: "greenhouse" }, externalIds: ["2"] } });
    expect(closed.json().closed).toBe(1);
    await db.query("UPDATE job SET first_seen_at = now() - interval '22 days'");
    expect(await expireJobs(db)).toBe(1);
    expect((await app.inject({ url: "/api/v1/jobs" })).json().total).toBe(0);
  });
});
