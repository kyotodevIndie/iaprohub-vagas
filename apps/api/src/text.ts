import { randomBytes } from "node:crypto";

/** Minúsculas, sem acento e com espaços simples: base da busca e dos slugs. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string, max = 80): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem l, o, 0 e 1 para não confundir no WhatsApp

/** Código curto do link /v/:code (7 caracteres, ~34 bilhões de combinações). */
export function shortCode(len = 7): string {
  const bytes = randomBytes(len);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
