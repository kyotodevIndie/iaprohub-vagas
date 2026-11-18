import type { PublicJob } from "./jobs";
import { LABELS } from "./vocab";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON dentro de <script>: escapa "<" para ninguém fechar a tag pelo conteúdo da vaga. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function jobDescriptionSnippet(j: PublicJob, max = 155): string {
  const parts = [j.company, j.workplace.map((w) => LABELS[w] ?? w).join("/"), j.location, j.salary].filter(Boolean);
  const head = `${j.title}${parts.length ? ` · ${parts.join(" · ")}` : ""}.`;
  const body = (j.description ?? "").replace(/\s+/g, " ").trim();
  const text = body ? `${head} ${body}` : head;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** schema.org JobPosting para o Google for Jobs. */
export function jobPostingLd(j: PublicJob, publicUrl: string) {
  const remote = j.workplace.includes("remoto");
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: j.title,
    description: esc(j.description ?? j.title).replace(/\n/g, "<br>"),
    datePosted: j.publishedAt,
    validThrough: j.expiresAt,
    hiringOrganization: { "@type": "Organization", name: j.company ?? "Empresa confidencial", ...(j.companyWebsite ? { sameAs: j.companyWebsite } : {}) },
    url: `${publicUrl}/vagas/${j.slug}`,
    directApply: false,
  };
  if (remote) {
    ld.jobLocationType = "TELECOMMUTE";
    ld.applicantLocationRequirements = { "@type": "Country", name: j.location ?? "Brasil" };
  } else if (j.location) {
    ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location, addressCountry: "BR" } };
  }
  const types: Record<string, string> = { clt: "FULL_TIME", pj: "CONTRACTOR", estagio: "INTERN", freelance: "CONTRACTOR", temporario: "TEMPORARY" };
  const emp = [...new Set(j.regime.map((r) => types[r]).filter(Boolean))];
  if (emp.length) ld.employmentType = emp;
  return ld;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
  noindex?: boolean;
}

/** Troca o <title> do index.html do Vue e injeta as meta tags da página. */
export function renderShell(html: string, m: PageMeta): string {
  const tags = [
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.canonical)}">`,
    `<meta property="og:type" content="website">`,
    m.noindex ? `<meta name="robots" content="noindex">` : "",
    m.jsonLd ? `<script type="application/ld+json">${scriptJson(m.jsonLd)}</script>` : "",
  ].filter(Boolean);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("</head>", `${tags.join("\n")}\n</head>`);
}

export function sitemapXml(publicUrl: string, rows: { slug: string; updated_at: Date }[]): string {
  const urls = [`<url><loc>${publicUrl}/</loc><changefreq>hourly</changefreq></url>`].concat(
    rows.map((r) => `<url><loc>${publicUrl}/vagas/${esc(r.slug)}</loc><lastmod>${r.updated_at.toISOString()}</lastmod></url>`),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
