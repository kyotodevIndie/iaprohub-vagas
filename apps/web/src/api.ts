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

async function get<T>(url: string, headers?: Record<string, string>): Promise<T> {
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

/** O slug termina com "-<code>". */
export const codeFromSlug = (slug: string) => slug.slice(slug.lastIndexOf("-") + 1);
