function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`variável ${name} não definida`);
  return v;
}

/** Google AdSense: só liga com um id de publicador válido (ca-pub-...). O slot é o bloco "no feed" da lista. */
function adsense(client?: string, slot?: string) {
  const c = client?.trim();
  if (!c) return null;
  if (!/^ca-pub-\d{10,20}$/.test(c)) throw new Error("ADSENSE_CLIENT deve ser ca-pub-<números>");
  const s = slot?.trim();
  return { client: c, slot: s && /^\d{5,20}$/.test(s) ? s : null };
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 4000),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  adminToken: required("ADMIN_TOKEN"),
  webDist: process.env.WEB_DIST || null,
  adsense: adsense(process.env.ADSENSE_CLIENT, process.env.ADSENSE_SLOT),
  // E-mail transacional pelo Resend. Sem chave, o código de login só aparece no log (desenvolvimento).
  email: process.env.RESEND_API_KEY && process.env.EMAIL_FROM
    ? { apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, apiUrl: process.env.RESEND_API_URL ?? "https://api.resend.com" }
    : null,
  // Cobrança do Pro pelo Nox (~/dev/nox/docs/API.md). Sem as três variáveis, o botão de assinar responde 503.
  nox: process.env.NOX_URL && process.env.NOX_CLIENT_ID && process.env.NOX_SECRET
    ? {
        url: process.env.NOX_URL.replace(/\/+$/, ""),
        clientId: process.env.NOX_CLIENT_ID,
        secret: process.env.NOX_SECRET,
        product: process.env.NOX_PRODUCT ?? "iaprohub-vagas",
        plan: process.env.NOX_PLAN ?? "pro",
      }
    : null,
};

export type Env = typeof env;
