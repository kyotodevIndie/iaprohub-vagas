import { fold } from "./text";

/** Valores aceitos nos campos usados pelos filtros do site. O agente pode mandar com acento ou maiúscula. */
export const VOCAB = {
  seniority: ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"],
  workplace: ["remoto", "hibrido", "presencial"],
  regime: ["clt", "pj", "estagio", "cooperado", "freelance", "temporario", "outro"],
  salaryPeriod: ["hour", "day", "month", "year"],
} as const;

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

const ALIASES: Record<string, string> = {
  estagiario: "estagio",
  intern: "estagio",
  internship: "estagio",
  jr: "junior",
  "mid-level": "pleno",
  mid: "pleno",
  sr: "senior",
  staff: "especialista",
  principal: "especialista",
  specialist: "especialista",
  lead: "lideranca",
  "tech lead": "lideranca",
  manager: "lideranca",
  gestao: "lideranca",
  remote: "remoto",
  hybrid: "hibrido",
  onsite: "presencial",
  "on-site": "presencial",
  contractor: "pj",
  freela: "freelance",
};

/** Normaliza um valor para o vocabulário; devolve null se não reconhecer. */
export function toVocab(kind: keyof typeof VOCAB, value: string): string | null {
  const v = fold(value);
  const mapped = ALIASES[v] ?? v;
  return (VOCAB[kind] as readonly string[]).includes(mapped) ? mapped : null;
}
