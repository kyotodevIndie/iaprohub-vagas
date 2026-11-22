import type { PublicJob } from "./jobs";
import { LABELS } from "./vocab";

const MAX_ITEMS = 25;

function workplaceLabel(j: PublicJob): string | null {
  if (!j.workplace.length) return j.location;
  const w = j.workplace.map((x) => LABELS[x] ?? x).join("/");
  return j.workplace.includes("remoto") || !j.location ? w : `${w} · ${j.location}`;
}

/**
 * Texto do resumo diário para colar nos grupos de WhatsApp: uma vaga por bloco curto
 * (cargo, empresa, modelo de trabalho, salário e o link curto da plataforma).
 */
export function buildDigest(jobs: PublicJob[], publicUrl: string, now = new Date()): string {
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  if (!jobs.length) return `Sem vagas novas nas últimas 24h.\n\n🔎 Todas as vagas: ${publicUrl}`;

  const lines = [`🚀 *Vagas tech de hoje (${date})*: ${jobs.length} ${jobs.length === 1 ? "nova" : "novas"}`, ""];
  for (const j of jobs.slice(0, MAX_ITEMS)) {
    const head = j.company ? `*${j.title}* · ${j.company}` : `*${j.title}*`;
    const details = [workplaceLabel(j), j.salary ? `💰 ${j.salary}` : null].filter(Boolean).join(" · ");
    lines.push(`• ${head}`);
    if (details) lines.push(`  ${details}`);
    lines.push(`  👉 ${publicUrl}/v/${j.code}`, "");
  }
  if (jobs.length > MAX_ITEMS) lines.push(`➕ Mais ${jobs.length - MAX_ITEMS} vagas no site.`, "");
  lines.push(`🔎 Todas as vagas: ${publicUrl}`);
  return lines.join("\n");
}
