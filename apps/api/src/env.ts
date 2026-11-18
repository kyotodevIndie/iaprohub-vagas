function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`variável ${name} não definida`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 4000),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  adminToken: required("ADMIN_TOKEN"),
  webDist: process.env.WEB_DIST || null,
};

export type Env = typeof env;
