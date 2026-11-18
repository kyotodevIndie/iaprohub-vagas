import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createLoginCode, endSession, hashIp, readCookie, SESSION_COOKIE, setSessionCookie, userFromRequest, verifyLoginCode } from "./auth";
import type { Db } from "./db";
import type { Env } from "./env";
import type { Mailer } from "./mail";
import { checkout, handleNoxEvent, NoxError, validNoxSignature } from "./nox";
import { getProfile, listApplications, logConsent, profileInput, saveCv, saveProfile, searchTalents, talentSearch } from "./talent";

const MAX_CV_BYTES = 3 * 1024 * 1024;
const emailField = z.email().max(200).transform((e) => e.trim().toLowerCase());

/** Contas (login por código), perfil e CV, assinatura Pro pelo Nox, recrutadores e pedidos de contato. */
export async function accountRoutes(
  app: FastifyInstance,
  db: Db,
  env: Env,
  mail: Mailer,
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  mailReady: boolean,
) {
  const secure = env.publicUrl.startsWith("https://");
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    req.user = (await userFromRequest(db, req)) ?? undefined;
    if (!req.user) return reply.code(401).send({ error: "entre na sua conta" });
  };
  const requireRecruiter = async (req: FastifyRequest, reply: FastifyReply) => {
    await requireUser(req, reply);
    if (reply.sent) return;
    if (req.user!.recruiterStatus !== "aprovado") return reply.code(403).send({ error: "conta de recrutador ainda não aprovada" });
  };
  const perHour = (max: number) => ({ rateLimit: { max, timeWindow: "1 hour" } });

  // ---- Login ----
  app.post("/api/v1/auth/code", { config: perHour(20) }, async (req, reply) => {
    const body = z.object({ email: emailField }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "e-mail inválido" });
    if (!mailReady) return reply.code(503).send({ error: "As contas abrem em breve." });
    const code = await createLoginCode(db, body.data.email);
    if (!code) return reply.code(429).send({ error: "muitos códigos pedidos; tente daqui a uma hora" });
    try {
      await mail({
        to: body.data.email,
        subject: `${code} é o seu código do IAPro Vagas`,
        paragraphs: [`Seu código para entrar no IAPro Vagas é ${code}.`, "Ele vale por 10 minutos. Se não foi você, ignore este e-mail."],
      });
    } catch (err) {
      req.log.error(err, "falha ao mandar o código");
      return reply.code(503).send({ error: "não deu para mandar o e-mail agora" });
    }
    return { ok: true };
  });

  app.post("/api/v1/auth/verify", { config: perHour(30) }, async (req, reply) => {
    const body = z
      .object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/), acceptTerms: z.literal(true) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande o e-mail, o código de 6 dígitos e o aceite dos termos" });
    const token = await verifyLoginCode(db, body.data.email, body.data.code);
    if (!token) return reply.code(401).send({ error: "código inválido ou vencido" });
    setSessionCookie(reply, token, secure);
    const { rows } = await db.query<{ id: number }>("SELECT id::int AS id FROM app_user WHERE email = $1", [body.data.email]);
    const accepted = await db.query("SELECT 1 FROM consent_log WHERE user_id = $1 AND purpose = 'termos'", [rows[0]!.id]);
    if (!accepted.rowCount) await logConsent(db, rows[0]!.id, "termos", true, hashIp(req.ip));
    return { ok: true };
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await endSession(db, token);
    setSessionCookie(reply, null, secure);
    return { ok: true };
  });

  // ---- Conta ----
  app.get("/api/v1/me", { preHandler: requireUser }, async (req) => {
    const { rows } = await db.query(
      `SELECT billing_status AS "billingStatus", paid_until AS "paidUntil" FROM app_user WHERE id = $1`,
      [req.user!.id],
    );
    return { user: { ...req.user, ...rows[0] }, profile: await getProfile(db, req.user!.id) };
  });

  app.put("/api/v1/me/profile", { preHandler: requireUser }, async (req, reply) => {
    const body = profileInput.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    return { profile: await saveProfile(db, req.user!.id, body.data, hashIp(req.ip)) };
  });

  // CV em PDF, corpo cru (Content-Type: application/pdf), nome do arquivo no header X-Filename.
  app.addContentTypeParser("application/pdf", { parseAs: "buffer", bodyLimit: MAX_CV_BYTES }, (_req, body, done) => done(null, body));
  app.put("/api/v1/me/cv", { preHandler: requireUser, bodyLimit: MAX_CV_BYTES }, async (req, reply) => {
    const pdf = req.body;
    if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return reply.code(400).send({ error: "mande um PDF de até 3 MB" });
    const raw = decodeURIComponent(String(req.headers["x-filename"] ?? "curriculo.pdf"));
    const filename = raw.replace(/[^\w.\- ]+/g, "").slice(0, 100) || "curriculo.pdf";
    if (!(await saveCv(db, req.user!.id, pdf, filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`))) {
      return reply.code(409).send({ error: "salve o perfil antes de mandar o currículo" });
    }
    return { profile: await getProfile(db, req.user!.id) };
  });

  app.get("/api/v1/me/cv", { preHandler: requireUser }, async (req, reply) => {
    const { rows } = await db.query<{ cv_pdf: Buffer | null; cv_filename: string | null }>(
      "SELECT cv_pdf, cv_filename FROM talent_profile WHERE user_id = $1",
      [req.user!.id],
    );
    if (!rows[0]?.cv_pdf) return reply.code(404).send({ error: "sem currículo" });
    return reply
      .type("application/pdf")
      .header("content-disposition", `inline; filename="${rows[0].cv_filename ?? "curriculo.pdf"}"`)
      .header("cache-control", "private, no-store")
      .send(rows[0].cv_pdf);
  });

  app.delete("/api/v1/me/cv", { preHandler: requireUser }, async (req) => {
    await db.query("UPDATE talent_profile SET cv_pdf = NULL, cv_filename = NULL, cv_updated_at = NULL WHERE user_id = $1", [req.user!.id]);
    return { profile: await getProfile(db, req.user!.id) };
  });

  app.get("/api/v1/me/applications", { preHandler: requireUser }, async (req) => ({ items: await listApplications(db, req.user!.id) }));

  // LGPD: apaga a conta e tudo ligado a ela (perfil, CV, consentimentos, envios, pedidos de contato).
  app.delete("/api/v1/me", { preHandler: requireUser }, async (req, reply) => {
    await db.query("DELETE FROM app_user WHERE id = $1", [req.user!.id]);
    setSessionCookie(reply, null, secure);
    return { deleted: true };
  });

  // ---- Assinatura Pro ----
  app.post("/api/v1/me/billing/checkout", { preHandler: requireUser, config: perHour(20) }, async (req, reply) => {
    if (!env.nox) return reply.code(503).send({ error: "a assinatura ainda não está disponível" });
    const body = z.object({ method: z.enum(["card", "pix"]).default("pix") }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "method: card ou pix" });
    try {
      return await checkout(db, env.nox, req.user!, body.data.method, `${env.publicUrl}/conta`);
    } catch (e) {
      if (e instanceof NoxError) return reply.code(e.status >= 500 ? 502 : e.status).send({ error: e.message, code: e.code });
      throw e;
    }
  });

  // O Nox assina o corpo cru: este escopo lê o JSON como Buffer.
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    scope.post("/api/v1/nox/webhook", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (req, reply) => {
      const raw = req.body as Buffer;
      const h = req.headers;
      if (!env.nox || !validNoxSignature(env.nox.secret, raw, h["x-nox-timestamp"] as string, h["x-nox-signature"] as string)) {
        return reply.code(401).send({ error: "assinatura inválida" });
      }
      let ev: unknown;
      try {
        ev = JSON.parse(raw.toString("utf8"));
      } catch {
        return reply.code(400).send({ error: "JSON inválido" });
      }
      await handleNoxEvent(db, ev as Parameters<typeof handleNoxEvent>[1]);
      return { ok: true };
    });
  });

  // ---- Recrutadores ----
  app.post("/api/v1/me/recruiter", { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ company: z.string().trim().min(2).max(120) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "mande { company }" });
    if (req.user!.recruiterStatus === "aprovado") return reply.code(409).send({ error: "conta já aprovada" });
    await db.query("UPDATE app_user SET recruiter_company = $2, recruiter_status = 'pendente' WHERE id = $1", [req.user!.id, body.data.company]);
    return { recruiterStatus: "pendente" };
  });

  app.get("/api/v1/talents", { preHandler: requireRecruiter }, async (req, reply) => {
    const q = talentSearch.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "filtro inválido" });
    return searchTalents(db, q.data);
  });

  app.post("/api/v1/talents/:id/contact", { preHandler: requireRecruiter, config: perHour(30) }, async (req, reply) => {
    const body = z.object({ message: z.string().trim().min(20).max(1500) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "escreva uma mensagem de 20 a 1500 caracteres" });
    const { rows } = await db.query<{ user_id: number; email: string }>(
      `SELECT p.user_id::int AS user_id, u.email FROM talent_profile p JOIN app_user u ON u.id = p.user_id
       WHERE p.public_id = $1 AND p.consent_talent_bank AND p.visibility <> 'oculto'`,
      [(req.params as { id: string }).id],
    );
    const talent = rows[0];
    if (!talent) return reply.code(404).send({ error: "perfil não encontrado" });
    const token = randomBytes(24).toString("base64url");
    const ins = await db.query(
      `INSERT INTO contact_request (token, recruiter_id, talent_id, message) VALUES ($1,$2,$3,$4)
       ON CONFLICT (recruiter_id, talent_id) DO NOTHING RETURNING id`,
      [token, req.user!.id, talent.user_id, body.data.message],
    );
    if (!ins.rowCount) return reply.code(409).send({ error: "você já pediu contato com esta pessoa" });
    await mail({
      to: talent.email,
      subject: `${req.user!.recruiterCompany} quer falar com você · IAPro Vagas`,
      paragraphs: [
        `Um recrutador da ${req.user!.recruiterCompany} viu seu perfil no banco de talentos do IAPro Vagas e mandou esta mensagem:`,
        body.data.message,
        "Seus dados de contato só são enviados a ele se você aceitar.",
      ],
      action: { label: "Responder ao pedido", url: `${env.publicUrl}/contato/${token}` },
    }).catch((err) => req.log.error(err, "falha ao avisar do pedido de contato"));
    return { ok: true };
  });

  app.get("/api/v1/contact/:token", async (req, reply) => {
    const { rows } = await db.query(
      `SELECT u.recruiter_company AS company, c.message, c.status FROM contact_request c JOIN app_user u ON u.id = c.recruiter_id
       WHERE c.token = $1`,
      [(req.params as { token: string }).token],
    );
    return rows[0] ?? reply.code(404).send({ error: "pedido não encontrado" });
  });

  app.post("/api/v1/contact/:token", { config: perHour(30) }, async (req, reply) => {
    const body = z.object({ decision: z.enum(["aceitar", "recusar"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "decision: aceitar ou recusar" });
    const status = body.data.decision === "aceitar" ? "aceito" : "recusado";
    const { rows } = await db.query<{ recruiter_email: string; email: string; name: string | null; phone: string | null; linkedin: string | null }>(
      `UPDATE contact_request c SET status = $2, responded_at = now()
       FROM app_user r, app_user t LEFT JOIN talent_profile p ON p.user_id = t.id
       WHERE c.token = $1 AND c.status = 'pendente' AND r.id = c.recruiter_id AND t.id = c.talent_id
       RETURNING r.email AS recruiter_email, t.email, p.name, p.phone, p.linkedin`,
      [(req.params as { token: string }).token, status],
    );
    const r = rows[0];
    if (!r) return reply.code(409).send({ error: "pedido já respondido ou inexistente" });
    if (status === "aceito") {
      await mail({
        to: r.recruiter_email,
        subject: `${r.name ?? "Um talento"} aceitou seu contato · IAPro Vagas`,
        paragraphs: [
          `${r.name ?? "A pessoa"} aceitou o seu pedido de contato. Os dados dela:`,
          [`E-mail: ${r.email}`, r.phone && `Telefone: ${r.phone}`, r.linkedin && `LinkedIn: ${r.linkedin}`].filter(Boolean).join("\n"),
        ],
        replyTo: r.email,
      }).catch((err) => req.log.error(err, "falha ao mandar o contato ao recrutador"));
    }
    return { status };
  });

  // ---- Admin: aprovar recrutadores ----
  app.get("/api/v1/admin/recruiters", { preHandler: requireAdmin }, async () => {
    const { rows } = await db.query(
      `SELECT id::int AS id, email, recruiter_company AS company, recruiter_status AS status, created_at AS "createdAt"
       FROM app_user WHERE recruiter_status IS NOT NULL ORDER BY (recruiter_status = 'pendente') DESC, id DESC LIMIT 200`,
    );
    return { items: rows };
  });

  app.post("/api/v1/admin/recruiters/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({ status: z.enum(["aprovado", "recusado"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "status: aprovado ou recusado" });
    const { rows } = await db.query<{ email: string }>(
      "UPDATE app_user SET recruiter_status = $2 WHERE id = $1 AND recruiter_status IS NOT NULL RETURNING email",
      [Number((req.params as { id: string }).id) || 0, body.data.status],
    );
    if (!rows[0]) return reply.code(404).send({ error: "recrutador não encontrado" });
    if (body.data.status === "aprovado") {
      await mail({
        to: rows[0].email,
        subject: "Sua conta de recrutador foi aprovada · IAPro Vagas",
        paragraphs: ["Pronto! Agora você pode buscar perfis no banco de talentos do IAPro Vagas e pedir contato."],
        action: { label: "Abrir o banco de talentos", url: `${env.publicUrl}/recrutador` },
      }).catch((err) => req.log.error(err, "falha ao avisar o recrutador"));
    }
    return { status: body.data.status };
  });
}
