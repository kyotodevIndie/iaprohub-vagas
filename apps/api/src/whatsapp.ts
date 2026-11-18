import type { Db } from "./db";
import { buildDigest } from "./digest";
import type { Env } from "./env";
import { jobsSince } from "./jobs";

// Resumo no grupo da comunidade pela Evolution API (~/dev/evolution). Uma mensagem em cada horário de DIGEST_TIMES
// (Brasília), só depois que o grupo for escolhido no admin (/admin/resumo).

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
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

/** Milissegundos até o próximo horário de `times` (HH:MM em Brasília, que não tem horário de verão: UTC-3). */
export function msUntilNext(times: string[], now = new Date()) {
  const brtNow = new Date(now.getTime() - 3 * 3600 * 1000);
  const minutes = brtNow.getUTCHours() * 60 + brtNow.getUTCMinutes();
  const slots = times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
  const next = slots.find((m) => m > minutes) ?? slots[0]! + 24 * 60;
  return (next - minutes) * 60_000 - brtNow.getUTCSeconds() * 1000 - brtNow.getUTCMilliseconds();
}

/**
 * Manda no grupo escolhido as vagas que chegaram desde o envio anterior (no máximo as últimas 24h), uma vez por
 * horário de `times` (HH:MM em Brasília). Se o servidor perder um horário, o seguinte leva as vagas dele.
 * Sem vaga nova, registra o horário e não manda nada. Falha no envio fica registrada e não é repetida no mesmo horário.
 */
export async function sendDigest(db: Db, wa: WhatsApp, publicUrl: string, times: string[], now = new Date()) {
  const t = brt(now);
  const time = times.filter((x) => x <= t.time).at(-1);
  if (!time) return null;
  const group = await getSetting(db, GROUP_SETTING);
  if (!group) return null;
  const slot = `${t.day} ${time}`;
  const { rows: prev } = await db.query<{ at: Date | null }>("SELECT max(created_at) AS at FROM wa_digest");
  const claim = await db.query(
    "INSERT INTO wa_digest (slot, group_jid, job_count) VALUES ($1, $2, 0) ON CONFLICT (slot) DO NOTHING RETURNING slot",
    [slot, group],
  );
  if (!claim.rowCount) return null;
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const since = prev[0]?.at && prev[0].at > dayAgo ? prev[0].at : dayAgo;
  const jobs = await jobsSince(db, since);
  if (!jobs.length) return { slot, count: 0 };
  try {
    await wa.sendText(group, buildDigest(jobs, publicUrl, now));
    await db.query("UPDATE wa_digest SET job_count = $2, sent_at = now() WHERE slot = $1", [slot, jobs.length]);
    return { slot, count: jobs.length };
  } catch (err) {
    await db.query("UPDATE wa_digest SET job_count = $2, error = $3 WHERE slot = $1", [slot, jobs.length, (err as Error).message.slice(0, 300)]);
    throw err;
  }
}
