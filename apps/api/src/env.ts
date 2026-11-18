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
};

export type Env = typeof env;
