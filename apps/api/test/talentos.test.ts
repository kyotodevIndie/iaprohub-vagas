import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createPool, runMigrations, type Db } from "../src/db";
import type { Mail } from "../src/mail";
import { matchNewJobs, sendApplications, sendDailyAlerts } from "../src/matching";
import { msUntilNext, sendDigest, type WhatsApp } from "../src/whatsapp";

// Schema próprio no mesmo banco de teste, para rodar em paralelo com api.test.ts.
const base = process.env.TEST_DATABASE_URL ?? "postgres://vagas:vagas@localhost:5442/vagas_test";
const url = `${base}${base.includes("?") ? "&" : "?"}options=-c%20search_path%3Dtalentos`;
const ADMIN = "admin-teste";
const NOX_SECRET = "segredo-nox";

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let ingestToken = "";
const outbox: Mail[] = [];
const waSent: { to: string; text: string }[] = [];
const fakeWa: WhatsApp = {
  state: async () => "open",
  groups: async () => [{ id: "123@g.us", subject: "IAPro Vagas", size: 300 }],
  sendText: async (to, text) => void waSent.push({ to, text }),
};

const probe = createPool(base);
const available = await probe.query("SELECT 1").then(() => true, () => false);
if (available) await probe.query("DROP SCHEMA IF EXISTS talentos CASCADE; CREATE SCHEMA talentos");
await probe.end();

beforeAll(async () => {
  if (!available) return;
  db = createPool(url);
  await runMigrations(db, () => {});
  app = await buildApp(
    db,
    {
      databaseUrl: url,
      port: 0,
      publicUrl: "https://site.test",
      adminToken: ADMIN,
      webDist: null,
      adsense: null,
      email: null,
      nox: { url: "http://nox.invalid", clientId: "c", secret: NOX_SECRET, product: "iaprohub-vagas", plan: "pro" },
      evolution: null,
    },
    { mailer: async (m) => void outbox.push(m), whatsapp: fakeWa },
  );
  const res = await app.inject({ method: "POST", url: "/api/v1/admin/clients", headers: { authorization: `Bearer ${ADMIN}` }, payload: { name: "gpt" } });
  ingestToken = res.json().token;
});

afterAll(async () => {
  await app?.close();
  await db?.end();
});

const lastMailTo = (to: string) => [...outbox].reverse().find((m) => m.to === to);

/** Login completo pelo código do e-mail; devolve o header de cookie da sessão. */
async function login(email: string) {
  await app.inject({ method: "POST", url: "/api/v1/auth/code", payload: { email } });
  const code = lastMailTo(email)!.subject.slice(0, 6);
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { email, code, acceptTerms: true } });
  expect(res.statusCode).toBe(200);
  return { cookie: String(res.headers["set-cookie"]).split(";")[0]! };
}

const profile = (extra: Record<string, unknown> = {}) => ({
  name: "Ana Souza",
  phone: "11 99999-0000",
  linkedin: "https://linkedin.com/in/ana",
  headline: "Dev Back-end",
  currentCompany: "Empresa Atual",
  summary: "Node e Postgres há 5 anos.",
  region: "SP",
  seniority: ["Sênior"],
  workplace: ["remoto"],
  stack: ["Node", "PostgreSQL"],
  salaryMin: 10000,
  visibility: "anonimo",
  consents: { talentBank: true, autoApply: true, alerts: true },
  ...extra,
});

function webhook(payload: object) {
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v1=${createHmac("sha256", NOX_SECRET).update(`${ts}.${raw}`).digest("hex")}`;
  return app.inject({
    method: "POST",
    url: "/api/v1/nox/webhook",
    headers: { "content-type": "application/json", "x-nox-timestamp": ts, "x-nox-signature": sig },
    payload: raw,
  });
}

const job = (id: string, extra: Record<string, unknown> = {}) => ({
  source: { kind: "greenhouse", externalId: id },
  title: `Dev Node ${id}`,
  company: { name: "Acme" },
  seniority: ["senior"],
  workplace: ["remoto"],
  stack: ["node", "aws"],
  salary: { min: 12000, max: 15000 },
  applyUrl: `https://acme.test/jobs/${id}`,
  ...extra,
});

describe.skipIf(!available)("Talentos Pro", () => {
  let ana: { cookie: string };
  let anaId = 0;

  it("login por código: exige o aceite, abre a sessão e registra os termos", async () => {
    await app.inject({ method: "POST", url: "/api/v1/auth/code", payload: { email: "Ana@Exemplo.com" } });
    const code = lastMailTo("ana@exemplo.com")!.subject.slice(0, 6);
    expect(code).toMatch(/^\d{6}$/);
    const noTerms = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { email: "ana@exemplo.com", code } });
    expect(noTerms.statusCode).toBe(400);
    const wrong = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { email: "ana@exemplo.com", code: code === "000000" ? "111111" : "000000", acceptTerms: true } });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { email: "ana@exemplo.com", code, acceptTerms: true } });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers["set-cookie"])).toMatch(/HttpOnly.*SameSite=Lax.*Secure/);
    ana = { cookie: String(ok.headers["set-cookie"]).split(";")[0]! };
    const me = await app.inject({ url: "/api/v1/me", headers: ana });
    expect(me.json().user).toMatchObject({ email: "ana@exemplo.com", pro: false });
    anaId = me.json().user.id;
    expect((await app.inject({ url: "/api/v1/me" })).statusCode).toBe(401);
    const terms = await db.query("SELECT 1 FROM consent_log WHERE user_id = $1 AND purpose = 'termos'", [anaId]);
    expect(terms.rowCount).toBe(1);
  });

  it("perfil: sem o aceite do banco fica oculto; consentimentos vão para o log; CV só PDF", async () => {
    const hidden = await app.inject({ method: "PUT", url: "/api/v1/me/profile", headers: ana, payload: profile({ consents: { talentBank: false, autoApply: false, alerts: false } }) });
    expect(hidden.json().profile).toMatchObject({ visibility: "oculto", seniority: ["senior"], stack: ["node", "postgresql"] });
    const saved = await app.inject({ method: "PUT", url: "/api/v1/me/profile", headers: ana, payload: profile() });
    expect(saved.json().profile.visibility).toBe("anonimo");
    const log = await db.query("SELECT purpose FROM consent_log WHERE user_id = $1 AND granted ORDER BY id", [anaId]);
    expect(log.rows.map((r) => r.purpose)).toEqual(["termos", "banco_talentos", "envio_automatico", "alertas"]);

    const notPdf = await app.inject({ method: "PUT", url: "/api/v1/me/cv", headers: { ...ana, "content-type": "application/pdf" }, payload: Buffer.from("oi") });
    expect(notPdf.statusCode).toBe(400);
    const pdf = Buffer.from("%PDF-1.4 currículo de teste");
    const up = await app.inject({ method: "PUT", url: "/api/v1/me/cv", headers: { ...ana, "content-type": "application/pdf", "x-filename": "ana%20cv.pdf" }, payload: pdf });
    expect(up.json().profile.cvFilename).toBe("ana cv.pdf");
    expect((await app.inject({ url: "/api/v1/me/cv", headers: ana })).rawPayload.equals(pdf)).toBe(true);
  });

  it("webhook do Nox: confere a assinatura, ignora versão velha e evento repetido", async () => {
    const sub = (version: number, access: boolean, status = "active") => ({
      id: `ev-${version}-${status}`,
      type: "subscription.status_changed",
      data: { subscription: { externalId: String(anaId), status, version, access, currentPeriodEnd: "2026-12-18T00:00:00Z" } },
    });
    const forged = await app.inject({ method: "POST", url: "/api/v1/nox/webhook", headers: { "content-type": "application/json", "x-nox-timestamp": "1", "x-nox-signature": "v1=00" }, payload: "{}" });
    expect(forged.statusCode).toBe(401);
    expect((await webhook(sub(3, true))).statusCode).toBe(200);
    await webhook(sub(2, false, "past_due"));
    expect((await app.inject({ url: "/api/v1/me", headers: ana })).json().user.pro).toBe(true);
  });

  it("vaga com e-mail vai com o CV ao recrutador; sem e-mail entra no alerta das 9h", async () => {
    const auth = { authorization: `Bearer ${ingestToken}` };
    await app.inject({
      method: "POST",
      url: "/api/v1/ingest/jobs",
      headers: auth,
      payload: { jobs: [job("10", { applyEmail: "RH@acme.test" }), job("11"), job("12", { stack: ["java"] }), job("13", { salary: { max: 5000 } })] },
    });
    expect(await matchNewJobs(db)).toBe(2);
    expect(await matchNewJobs(db)).toBe(0);

    outbox.length = 0;
    expect(await sendApplications(db, async (m) => void outbox.push(m))).toBe(1);
    const toRh = lastMailTo("rh@acme.test")!;
    expect(toRh.replyTo).toBe("ana@exemplo.com");
    expect(toRh.attachments?.[0]?.filename).toBe("ana cv.pdf");
    expect(toRh.paragraphs.join("\n")).toContain("Telefone: 11 99999-0000");

    expect(await sendDailyAlerts(db, async (m) => void outbox.push(m), "https://site.test", new Date("2026-11-18T10:00:00Z"))).toBe(0); // 7h em SP
    expect(await sendDailyAlerts(db, async (m) => void outbox.push(m), "https://site.test", new Date("2026-11-18T13:00:00Z"))).toBe(1);
    const alert = lastMailTo("ana@exemplo.com")!.paragraphs.join("\n");
    expect(alert).toContain("Dev Node 11");
    expect(alert).toContain("https://site.test/v/");
    expect(alert).toContain("Seu currículo foi enviado automaticamente para:\n• Dev Node 10 · Acme");
    expect(await sendDailyAlerts(db, async (m) => void outbox.push(m), "https://site.test", new Date("2026-11-18T14:00:00Z"))).toBe(0);

    const apps = (await app.inject({ url: "/api/v1/me/applications", headers: ana })).json().items;
    expect(apps.map((a: { channel: string; status: string }) => `${a.channel}:${a.status}`).sort()).toEqual(["alerta:enviado", "email:enviado"]);
  });

  it("WhatsApp: só manda depois de escolher o grupo, uma vez por horário, com as vagas desde o envio anterior", async () => {
    const admin = { authorization: `Bearer ${ADMIN}` };
    const times = ["09:10", "12:10", "17:10"];
    const at = (iso: string) => sendDigest(db, fakeWa, "https://site.test", times, new Date(iso));
    expect(msUntilNext(times, new Date("2026-11-18T12:00:00Z"))).toBe(10 * 60_000); // 9h00 em SP
    expect(msUntilNext(times, new Date("2026-11-18T20:10:00Z"))).toBe(16 * 3600_000); // 17h10 → 9h10
    expect(await at("2026-11-18T13:00:00Z")).toBeNull(); // sem grupo escolhido
    const info = (await app.inject({ url: "/api/v1/admin/whatsapp", headers: admin })).json();
    expect(info).toMatchObject({ enabled: true, state: "open", groupJid: null, groups: [{ id: "123@g.us" }] });
    expect((await app.inject({ method: "PUT", url: "/api/v1/admin/whatsapp", headers: admin, payload: { groupJid: "5585999@s.whatsapp.net" } })).statusCode).toBe(400);
    await app.inject({ method: "PUT", url: "/api/v1/admin/whatsapp", headers: admin, payload: { groupJid: "123@g.us" } });

    expect(await at("2026-11-18T12:05:00Z")).toBeNull(); // 9h05 em SP, antes do primeiro horário
    await db.query("UPDATE job SET first_seen_at = now() - interval '1 hour'");
    const sent = await at("2026-11-18T12:15:00Z");
    expect(sent).toMatchObject({ slot: "2026-11-18 09:10" });
    expect(sent!.count).toBeGreaterThan(0);
    expect(waSent).toHaveLength(1);
    expect(waSent[0]!.to).toBe("123@g.us");
    expect(waSent[0]!.text).toContain("Vagas tech de hoje");
    expect(await at("2026-11-18T13:00:00Z")).toBeNull(); // 9h10 já saiu
    // 12h10: as mesmas vagas não vão de novo
    expect(await at("2026-11-18T15:11:00Z")).toEqual({ slot: "2026-11-18 12:10", count: 0 });
    expect(waSent).toHaveLength(1);
    expect((await app.inject({ url: "/api/v1/admin/whatsapp", headers: admin })).json().sends[0]).toMatchObject({ slot: "18/11 12:10" });

    const manual = await app.inject({ method: "POST", url: "/api/v1/admin/whatsapp/send", headers: admin, payload: { hours: 24 } });
    expect(manual.json().sent).toBeGreaterThan(0);
    expect(waSent).toHaveLength(2);
  });

  it("recrutador: pede acesso, admin aprova, busca anônima, contato aceito pela pessoa", async () => {
    const rec = await login("rh@empresa.test");
    expect((await app.inject({ url: "/api/v1/talents", headers: rec })).statusCode).toBe(403);
    await app.inject({ method: "POST", url: "/api/v1/me/recruiter", headers: rec, payload: { company: "Empresa X" } });
    const admin = { authorization: `Bearer ${ADMIN}` };
    const pending = (await app.inject({ url: "/api/v1/admin/recruiters", headers: admin })).json().items;
    expect(pending[0]).toMatchObject({ email: "rh@empresa.test", status: "pendente" });
    await app.inject({ method: "POST", url: `/api/v1/admin/recruiters/${pending[0].id}`, headers: admin, payload: { status: "aprovado" } });

    const found = (await app.inject({ url: "/api/v1/talents?q=node", headers: rec })).json();
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({ headline: "Dev Back-end", pro: true, linkedin: null, currentCompany: null });
    expect(found.items[0]).not.toHaveProperty("name");

    const short = await app.inject({ method: "POST", url: `/api/v1/talents/${found.items[0].id}/contact`, headers: rec, payload: { message: "oi" } });
    expect(short.statusCode).toBe(400);
    const message = "Olá! Temos uma vaga sênior de Node remota e seu perfil encaixa.";
    await app.inject({ method: "POST", url: `/api/v1/talents/${found.items[0].id}/contact`, headers: rec, payload: { message } });
    const link = lastMailTo("ana@exemplo.com")!.action!.url;
    const token = link.split("/contato/")[1]!;
    expect((await app.inject({ url: `/api/v1/contact/${token}` })).json()).toMatchObject({ company: "Empresa X", message, status: "pendente" });
    await app.inject({ method: "POST", url: `/api/v1/contact/${token}`, payload: { decision: "aceitar" } });
    expect(lastMailTo("rh@empresa.test")!.paragraphs.join("\n")).toContain("E-mail: ana@exemplo.com");
    expect((await app.inject({ method: "POST", url: `/api/v1/contact/${token}`, payload: { decision: "recusar" } })).statusCode).toBe(409);
  });

  it("apagar a conta leva perfil, CV e consentimentos junto", async () => {
    expect((await app.inject({ method: "DELETE", url: "/api/v1/me", headers: ana })).json().deleted).toBe(true);
    const left = await db.query("SELECT (SELECT count(*) FROM talent_profile WHERE user_id = $1)::int + (SELECT count(*) FROM consent_log WHERE user_id = $1)::int AS n", [anaId]);
    expect(left.rows[0].n).toBe(0);
    expect((await app.inject({ url: "/api/v1/me", headers: ana })).statusCode).toBe(401);
  });
});
