import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Cria um cliente da API de ingestão. O token só aparece aqui; no banco fica o hash. */
export async function createClient(db: Db, name: string) {
  const token = `ivk_${randomBytes(24).toString("base64url")}`;
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO ingest_client (name, token_hash) VALUES ($1, $2) RETURNING id",
    [name, hashToken(token)],
  );
  return { id: rows[0]!.id, name, token };
}

export async function findClientByToken(db: Db, token: string) {
  const { rows } = await db.query<{ id: number; name: string }>(
    "SELECT id, name FROM ingest_client WHERE token_hash = $1 AND enabled",
    [hashToken(token)],
  );
  return rows[0] ?? null;
}
