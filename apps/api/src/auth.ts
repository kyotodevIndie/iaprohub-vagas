import { createHash, randomBytes, randomInt } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db";

// Login sem senha: código de 6 dígitos no e-mail (10 min, 5 tentativas) e sessão em cookie httpOnly por 30 dias.

export const SESSION_COOKIE = "ivs";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface User {
  id: number;
  email: string;
  pro: boolean;
  recruiterStatus: "pendente" | "aprovado" | "recusado" | null;
  recruiterCompany: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

/** Gera um código novo (e invalida os anteriores do mesmo e-mail). Devolve null se pediu códigos demais na última hora. */
export async function createLoginCode(db: Db, email: string): Promise<string | null> {
  const { rows } = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM login_code WHERE email = $1 AND created_at > now() - interval '1 hour'",
    [email],
  );
  if (rows[0]!.n >= 5) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.query("UPDATE login_code SET used_at = now() WHERE email = $1 AND used_at IS NULL", [email]);
  await db.query(
    "INSERT INTO login_code (email, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))",
    [email, sha(`${email}:${code}`), CODE_MINUTES],
  );
  return code;
}

/** Confere o código; se bater, cria (ou acha) a conta e abre a sessão. Devolve o token da sessão. */
export async function verifyLoginCode(db: Db, email: string, code: string): Promise<string | null> {
  const { rows } = await db.query<{ id: number; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM login_code
     WHERE email = $1 AND used_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  if (row.code_hash !== sha(`${email}:${code}`)) {
    await db.query("UPDATE login_code SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    return null;
  }
  await db.query("UPDATE login_code SET used_at = now() WHERE id = $1", [row.id]);
  const user = await db.query<{ id: number }>(
    `INSERT INTO app_user (email, last_login_at) VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET last_login_at = now() RETURNING id`,
    [email],
  );
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO user_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))",
    [sha(token), user.rows[0]!.id, SESSION_DAYS],
  );
  return token;
}

export async function endSession(db: Db, token: string) {
  await db.query("DELETE FROM user_session WHERE token_hash = $1", [sha(token)]);
}

export function readCookie(req: FastifyRequest, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string | null, secure: boolean) {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", secure ? "Secure" : "", `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  reply.header("set-cookie", `${SESSION_COOKIE}=${token ?? ""}; ${attrs.filter(Boolean).join("; ")}`);
}

export async function userFromRequest(db: Db, req: FastifyRequest): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id::int AS id, u.email, u.billing_access AS pro, u.recruiter_status AS "recruiterStatus", u.recruiter_company AS "recruiterCompany"
     FROM user_session s JOIN app_user u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha(token)],
  );
  return (rows[0] as User | undefined) ?? null;
}

export const hashIp = (ip: string) => sha(`ip:${ip}`).slice(0, 16);
