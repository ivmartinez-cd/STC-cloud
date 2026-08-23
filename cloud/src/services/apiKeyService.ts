import crypto from "crypto";
import { Knex } from "knex";

/**
 * API keys de la API pública (integración ERP) — alta entropía generada por
 * el servidor (mismo criterio que `activation_key` de agente), pero a
 * diferencia de esa, vive indefinidamente en la DB en vez de anularse tras
 * un solo uso: se guarda sólo el hash SHA-256, nunca el valor en claro, para
 * que un dump de la tabla no filtre keys usables. No hace falta el costo de
 * scrypt/bcrypt (pensado para secretos de baja entropía re-ingresados por un
 * humano) porque el key ya tiene 256 bits de entropía propios.
 */
const KEY_PREFIX_LEN = 12;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export interface ApiKeyRecord {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Crea una key nueva. El valor en claro sólo se devuelve acá — no se puede recuperar después. */
export async function createApiKey(
  db: Knex,
  clientId: string,
  name: string
): Promise<{ id: string; key: string }> {
  const rawKey = crypto.randomBytes(32).toString("hex");
  const [row] = await db("api_keys")
    .insert({
      client_id: clientId,
      name,
      key_hash: hashKey(rawKey),
      key_prefix: rawKey.slice(0, KEY_PREFIX_LEN),
    })
    .returning("id");
  return { id: row.id, key: rawKey };
}

export async function listApiKeys(db: Knex, clientId: string): Promise<ApiKeyRecord[]> {
  return db("api_keys")
    .where({ client_id: clientId })
    .select("id", "client_id", "name", "key_prefix", "revoked_at", "last_used_at", "created_at")
    .orderBy("created_at", "desc");
}

/** Tombstone — no borra la fila, mismo criterio que `devices.decommissioned_at`. */
export async function revokeApiKey(db: Knex, clientId: string, keyId: string): Promise<number> {
  return db("api_keys")
    .where({ id: keyId, client_id: clientId })
    .whereNull("revoked_at")
    .update({ revoked_at: db.fn.now() });
}

/** Resuelve una key cruda (header `X-Api-Key`) a su cliente, o `null` si no existe/está revocada. */
export async function resolveApiKey(
  db: Knex,
  rawKey: string
): Promise<{ apiKeyId: string; clientId: string } | null> {
  const row = await db("api_keys")
    .where({ key_hash: hashKey(rawKey) })
    .whereNull("revoked_at")
    .select("id", "client_id", "last_used_at")
    .first();
  if (!row) return null;

  const stale =
    !row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > LAST_USED_THROTTLE_MS;
  if (stale) {
    // Fire-and-forget: no bloquear la request por esta escritura de housekeeping.
    db("api_keys").where({ id: row.id }).update({ last_used_at: db.fn.now() }).catch(() => {});
  }

  return { apiKeyId: row.id, clientId: row.client_id };
}
