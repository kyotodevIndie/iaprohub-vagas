export interface Job {
  code: string;
  slug: string;
  source: string;
  title: string;
  company: string | null;
  companyWebsite: string | null;
  description: string | null;
  seniority: string[];
  workplace: string[];
  regime: string[];
  stack: string[];
  location: string | null;
  salary: string | null;
  applyUrl: string;
  publishedAt: string;
  expiresAt: string;
}

export interface JobPage {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
}

export const LABELS: Record<string, string> = {
  estagio: "Estágio",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
  lideranca: "Liderança",
  remoto: "Remoto",
  hibrido: "Híbrido",
  presencial: "Presencial",
  clt: "CLT",
  pj: "PJ",
  cooperado: "Cooperado",
  freelance: "Freelance",
  temporario: "Temporário",
  outro: "Outro",
};

export const label = (v: string) => LABELS[v] ?? v;

export async function get<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}

export interface Ad {
  id: number;
  title: string;
  text: string | null;
  cta: string | null;
  url: string;
}

export const fetchAds = () => get<{ ads: Ad[] }>("/api/v1/ads").then((r) => r.ads);
export const fetchJobs = (params: URLSearchParams) => get<JobPage>(`/api/v1/jobs?${params}`);
export const fetchJob = (code: string) => get<Job>(`/api/v1/jobs/${encodeURIComponent(code)}`);
export const fetchDigest = (token: string, hours: number) =>
  get<{ count: number; text: string }>(`/api/v1/admin/digest?hours=${hours}`, { authorization: `Bearer ${token}` });

/** "hoje", "ontem", "há 3 dias". */
export function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/** Data em pt-BR no fuso de São Paulo: "18/11/2026" (ou "18/11" com short). */
export const date = (iso: string, short = false) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(short ? {} : { year: "numeric" }),
  });

/** O slug termina com "-<code>". */
export const codeFromSlug = (slug: string) => slug.slice(slug.lastIndexOf("-") + 1);

/** POST/PUT/DELETE com JSON; o erro traz o status e a mensagem da API. */
export async function send<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isRaw = body instanceof Blob;
  const res = await fetch(url, {
    method,
    headers: { ...(body !== undefined && !isRaw ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
  return data as T;
}

export const errorMessage = (err: unknown) => (err as Error).message || "Algo deu errado. Tente de novo.";

export interface Me {
  id: number;
  email: string;
  pro: boolean;
  billingStatus: "trial" | "active" | "past_due" | "canceled" | null;
  paidUntil: string | null;
  recruiterStatus: "pendente" | "aprovado" | "recusado" | null;
  recruiterCompany: string | null;
}

export interface Profile {
  publicId: string;
  name: string | null;
  phone: string | null;
  linkedin: string | null;
  headline: string | null;
  currentCompany: string | null;
  summary: string | null;
  region: string | null;
  seniority: string[];
  workplace: string[];
  stack: string[];
  salaryMin: number | null;
  visibility: "oculto" | "anonimo" | "aberto";
  consents: { talentBank: boolean; autoApply: boolean; alerts: boolean };
  cvFilename: string | null;
  cvUpdatedAt: string | null;
}

export interface Application {
  jobCode: string;
  jobTitle: string;
  company: string | null;
  applyUrl: string;
  channel: "email" | "alerta";
  toEmail: string | null;
  status: "pendente" | "enviado" | "falhou";
  createdAt: string;
  sentAt: string | null;
}

export interface Talent {
  id: string;
  headline: string | null;
  seniority: string[];
  workplace: string[];
  stack: string[];
  region: string | null;
  summary: string | null;
  salaryMin: number | null;
  visibility: "anonimo" | "aberto";
  pro: boolean;
  currentCompany: string | null;
  linkedin: string | null;
}
