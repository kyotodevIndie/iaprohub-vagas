import type { Db } from "./db";
import { buildDigest } from "./digest";
import type { Env } from "./env";
import { recentJobs } from "./jobs";

// Resumo diário no grupo da comunidade pela Evolution API (~/dev/evolution). Uma mensagem por dia, no horário do
// DIGEST_HOUR (Brasília), só depois que o grupo for escolhido no admin (/admin/resumo).

export interface WhatsApp {
  state(): Promise<string>;
  groups(): Promise<{ id: string; subject: string; size: number | null }[]>;
  sendText(to: string, text: string): Promise<void>;
}

export function createWhatsApp(cfg: NonNullable<Env["evolution"]>): WhatsApp {
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: { apikey: cfg.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) throw new Error("a Evolution não respondeu");
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(`Evolution HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  };
  const inst = encodeURIComponent(cfg.instance);
  return {
    state: async () => (await call("GET", `/instance/connectionState/${inst}`)).instance?.state ?? "desconhecido",
    groups: async () =>
      ((await call("GET", `/group/fetchAllGroups/${inst}?getParticipants=false`)) as any[]).map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size ?? null,
      })),
    sendText: async (to, text) => {
      await call("POST", `/message/sendText/${inst}`, { number: to, text });
    },
  };
}

export const GROUP_SETTING = "wa_group_jid";

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const { rows } = await db.query<{ value: string }>("SELECT value FROM app_setting WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string | null) {
  if (value === null) await db.query("DELETE FROM app_setting WHERE key = $1", [key]);
  else
    await db.query(
      "INSERT INTO app_setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
      [key, value],
    );
}

const brt = (now: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

/**
 * Manda o resumo das últimas 24h no grupo escolhido, uma vez por dia, a partir de `hour` (Brasília).
 * Sem vaga nova, registra o dia e não manda nada. Falha no envio fica registrada e não é repetida no mesmo dia.
 */
export async function sendDailyDigest(db: Db, wa: WhatsApp, publicUrl: string, hour: number, now = new Date()) {
  const t = brt(now);
  if (t.hour < hour) return null;
  const group = await getSetting(db, GROUP_SETTING);
  if (!group) return null;
  const claim = await db.query(
    "INSERT INTO wa_digest (day, group_jid, job_count) VALUES ($1, $2, 0) ON CONFLICT (day) DO NOTHING RETURNING day",
    [t.day, group],
  );
  if (!claim.rowCount) return null;
  const jobs = await recentJobs(db, 24);
  if (!jobs.length) return { day: t.day, count: 0 };
  try {
    await wa.sendText(group, buildDigest(jobs, publicUrl, now));
    await db.query("UPDATE wa_digest SET job_count = $2, sent_at = now() WHERE day = $1", [t.day, jobs.length]);
    return { day: t.day, count: jobs.length };
  } catch (err) {
    await db.query("UPDATE wa_digest SET job_count = $2, error = $3 WHERE day = $1", [t.day, jobs.length, (err as Error).message.slice(0, 300)]);
    throw err;
  }
}
