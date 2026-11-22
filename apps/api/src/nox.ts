import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import type { Env } from "./env";

// Cliente do Nox (cobrança do Pro), conforme ~/dev/nox/docs/API.md: chamadas assinadas com HMAC
// e o webhook com o status da assinatura. externalId = id do app_user.

type NoxCfg = NonNullable<Env["nox"]>;

export class NoxError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function nox(cfg: NoxCfg, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const canonical = [ts, nonce, method, path, createHash("sha256").update(raw).digest("hex")].join("\n");
  const sig = `v1=${createHmac("sha256", cfg.secret).update(canonical).digest("hex")}`;
  const res = await fetch(cfg.url + path, {
    method,
    body: raw || undefined,
    headers: {
      ...(raw ? { "content-type": "application/json" } : {}),
      "x-nox-client": cfg.clientId,
      "x-nox-timestamp": ts,
      "x-nox-nonce": nonce,
      "x-nox-signature": sig,
    },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) throw new NoxError("o Nox não respondeu", 503);
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new NoxError(data.error ?? `Nox HTTP ${res.status}`, res.status, data.code);
  return data;
}

export interface SubscriptionView {
  externalId: string;
  status: "trial" | "active" | "past_due" | "canceled";
  version: number;
  currentPeriodEnd: string | null;
  access: boolean;
}

/** Aplica o status só se a versão for maior que a guardada (webhook fora de ordem, corrida com a consulta). */
export async function applySubscription(db: Db, s: SubscriptionView) {
  await db.query(
    `UPDATE app_user SET billing_status = $2, billing_version = $3, billing_access = $4, paid_until = $5
     WHERE id::text = $1 AND billing_version < $3`,
    [s.externalId, s.status, s.version, s.access, s.currentPeriodEnd],
  );
}

/** Abre o checkout do Pro (cartão ou Pix). Registra o cliente no Nox na primeira vez. */
export async function checkout(db: Db, cfg: NoxCfg, user: { id: number; email: string }, method: "card" | "pix", backUrl: string) {
  const payload = { externalId: String(user.id), product: cfg.product, plan: cfg.plan, method, payerEmail: user.email, backUrl };
  try {
    return await nox(cfg, "POST", "/api/v1/subscriptions/checkout", payload);
  } catch (e) {
    if (!(e instanceof NoxError && e.code === "SUBSCRIPTION_NOT_FOUND")) throw e;
    const out = await nox(cfg, "POST", "/api/v1/customers", {
      externalId: String(user.id),
      name: user.email,
      email: user.email,
      product: cfg.product,
      plan: cfg.plan,
    });
    if (out.subscription) await applySubscription(db, out.subscription);
    return nox(cfg, "POST", "/api/v1/subscriptions/checkout", payload);
  }
}

/** Confere X-Nox-Signature = v1=hmac(secret, "<timestamp>.<corpo cru>") e o relógio (±5 min). */
export function validNoxSignature(secret: string, raw: Buffer, ts: string | undefined, sig: string | undefined): boolean {
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = `v1=${createHmac("sha256", secret).update(`${ts}.`).update(raw).digest("hex")}`;
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Processa um evento do webhook uma vez só (idempotência por id). */
export async function handleNoxEvent(db: Db, ev: { id?: string; data?: { subscription?: SubscriptionView } }) {
  if (!ev.id) return;
  const fresh = await db.query("INSERT INTO nox_event (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id", [ev.id]);
  if (!fresh.rowCount) return;
  if (ev.data?.subscription) await applySubscription(db, ev.data.subscription);
}
