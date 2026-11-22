import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest";
import { jobInput } from "../src/ingest";
import { formatSalary, type PublicJob } from "../src/jobs";
import { renderShell } from "../src/seo";
import { slugify } from "../src/text";

const sal = (min: number | null, max: number | null, extra: Partial<Record<string, string | null>> = {}) =>
  formatSalary({
    salary_min: min === null ? null : String(min),
    salary_max: max === null ? null : String(max),
    salary_currency: "BRL",
    salary_period: "month",
    salary_text: null,
    ...extra,
  });

describe("formatSalary", () => {
  it("formata faixas em mil", () => {
    expect(sal(12000, 15000)).toBe("R$ 12–15 mil");
    expect(sal(8500, null)).toBe("a partir de R$ 8,5 mil");
    expect(sal(null, 9000)).toBe("R$ 9 mil");
    expect(sal(5000, 7000, { salary_currency: "USD" })).toBe("US$ 5–7 mil");
    expect(sal(120000, 150000, { salary_period: "year" })).toBe("R$ 120–150 mil/ano");
    expect(sal(80, 120, { salary_period: "hour" })).toBe("R$ 80–120/h");
  });
  it("usa o texto livre quando houver e devolve null sem salário", () => {
    expect(sal(null, null, { salary_text: "A combinar" })).toBe("A combinar");
    expect(sal(null, null)).toBeNull();
  });
});

describe("jobInput", () => {
  const base = { source: { kind: "greenhouse", externalId: "1" }, title: "Dev", applyUrl: "https://x.com/a" };
  it("aceita o mínimo e normaliza o vocabulário", () => {
    const r = jobInput.parse({ ...base, seniority: ["Sênior", "sr"], workplace: ["Remote"], stack: ["React", "react"] });
    expect(r.seniority).toEqual(["senior"]);
    expect(r.workplace).toEqual(["remoto"]);
    expect(r.stack).toEqual(["react"]);
  });
  it("recusa sem id/url de origem, sem link de candidatura ou com valor fora do vocabulário", () => {
    expect(jobInput.safeParse({ ...base, source: { kind: "x" } }).success).toBe(false);
    expect(jobInput.safeParse({ ...base, applyUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(jobInput.safeParse({ ...base, workplace: ["lua"] }).success).toBe(false);
  });
});

describe("buildDigest", () => {
  const job = (i: number, extra: Partial<PublicJob> = {}): PublicJob => ({
    code: `c${i}`,
    slug: `s${i}`,
    source: "gupy",
    title: `Vaga ${i}`,
    company: null,
    companyWebsite: null,
    description: null,
    seniority: [],
    workplace: [],
    regime: [],
    stack: [],
    location: null,
    salary: null,
    applyUrl: "https://x",
    publishedAt: "2026-11-18T10:00:00Z",
    expiresAt: "2026-12-09T10:00:00Z",
    ...extra,
  });

  it("mostra cargo, empresa, modelo, salário e o link curto", () => {
    const text = buildDigest(
      [job(1, { company: "Acme", workplace: ["remoto"], salary: "R$ 12–15 mil" }), job(2, { workplace: ["hibrido"], location: "São Paulo, SP" })],
      "https://site",
      new Date("2026-11-18T12:00:00Z"),
    );
    expect(text).toContain("*Vagas tech de hoje (18/11)*: 2 novas");
    expect(text).toContain("• *Vaga 1* · Acme\n  Remoto · 💰 R$ 12–15 mil\n  👉 https://site/v/c1");
    expect(text).toContain("• *Vaga 2*\n  Híbrido · São Paulo, SP\n  👉 https://site/v/c2");
    expect(text.trim().endsWith("🔎 Todas as vagas: https://site")).toBe(true);
  });

  it("corta em 25 e avisa quantas faltam", () => {
    const text = buildDigest(Array.from({ length: 30 }, (_, i) => job(i)), "https://site");
    expect(text.match(/👉/g)).toHaveLength(25);
    expect(text).toContain("Mais 5 vagas no site");
  });
});

describe("seo", () => {
  it("slug sem acento e escape do JSON-LD", () => {
    expect(slugify("Desenvolvedor(a) Back-end Sênior · Ação")).toBe("desenvolvedor-a-back-end-senior-acao");
    const html = renderShell("<html><head><title>x</title></head></html>", {
      title: "A & B",
      description: 'diz "oi"',
      canonical: "https://s/",
      jsonLd: { d: "</script><script>alert(1)</script>" },
    });
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).not.toContain("</script><script>alert");
  });
});
