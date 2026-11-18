import type { Env } from "./env";

export interface Mail {
  to: string;
  subject: string;
  /** Parágrafos de texto puro; viram <p> no HTML. */
  paragraphs: string[];
  action?: { label: string; url: string };
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
}

export type Mailer = (m: Mail) => Promise<void>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderMail(m: Mail) {
  const btn = m.action
    ? `<p><a href="${esc(m.action.url)}" style="display:inline-block;padding:10px 18px;background:#2fb81b;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${esc(m.action.label)}</a></p>
<p style="color:#777;font-size:13px">Se o botão não abrir, copie: ${esc(m.action.url)}</p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222">
${m.paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
${btn}
<p style="color:#999;font-size:12px">IAPro Vagas</p></div>`;
  const text = `${m.paragraphs.join("\n\n")}${m.action ? `\n\n${m.action.label}: ${m.action.url}` : ""}`;
  return { html, text };
}

/** Resend (API HTTP). Sem configuração, só registra no log: serve para rodar local sem mandar e-mail. */
export function createMailer(env: Env, log: (msg: string) => void): Mailer {
  const cfg = env.email;
  if (!cfg) {
    return async (m) => log(`[e-mail não configurado] para ${m.to}: ${m.subject}\n${renderMail(m).text}`);
  }
  return async (m) => {
    const { html, text } = renderMail(m);
    const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [m.to],
        subject: m.subject,
        html,
        text,
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(m.attachments?.length
          ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
          : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res?.ok) throw new Error(`o envio de e-mail falhou (${res?.status ?? "sem resposta"})`);
  };
}
