import crypto from "crypto";
import { decryptSecret, encryptSecret, isEncryptionConfigured, MissingEncryptionKeyError } from "./cryptoService";
import { logger } from "../logger";

/**
 * Lista ordenada de credenciales SNMP por agente (§2.3 del gap analysis:
 * "SNMPv3 + lista de credenciales", probadas en orden por el agente hasta que
 * una responda). Lógica pura — sin Knex, sin Fastify — para poder testearla
 * sin base ni servidor (mismo criterio que `rolePolicy.ts`).
 *
 * Almacenamiento: una columna `agents.snmp_credentials jsonb` (ver la
 * migración), NO una tabla aparte ni un blob único cifrado. Cada secreto se
 * cifra individualmente (`*_enc`); el resto de los campos (label, username,
 * protocolos) va en claro A PROPÓSITO — `msgUserName` y los protocolos viajan
 * fuera del scopedPDU cifrado en cada PDU SNMPv3 por diseño del protocolo
 * (RFC 3414), no son secretos. Este layout es el único que permite
 * reordenar/renombrar/borrar una entrada sin la clave de cifrado (copiando el
 * ciphertext opaco tal cual) y que la vista enmascarada sobreviva si la clave
 * se pierde.
 */

export type SnmpVersion = "v1" | "v2c" | "v3";
export type SecurityLevel = "noAuthNoPriv" | "authNoPriv" | "authPriv";
export type AuthProtocol = "md5" | "sha" | "sha224" | "sha256" | "sha384" | "sha512";
export type PrivProtocol = "des" | "aes" | "aes256b" | "aes256r";

const MAX_CREDENTIALS = 8;
const MIN_PASSPHRASE_LEN = 8; // RFC 3414: las claves localizadas de USM requieren >= 8 caracteres
const MAX_COMMUNITY_LEN = 64; // mismo límite que agents.snmp_community (varchar(64)) hoy
const MAX_LABEL_LEN = 100;

/** Como se persiste en `agents.snmp_credentials`. */
export interface StoredCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  community_enc?: string;
  username?: string;
  security_level?: SecurityLevel;
  auth_protocol?: AuthProtocol;
  auth_key_enc?: string;
  priv_protocol?: PrivProtocol;
  priv_key_enc?: string;
}

/** Como llega en el body del PUT — una referencia a lo ya guardado, o material nuevo. */
export type CredentialInput =
  | { ref: string }
  | { version: "v1" | "v2c"; label?: string | null; community: string }
  | {
      version: "v3";
      label?: string | null;
      username: string;
      security_level: SecurityLevel;
      auth_protocol?: AuthProtocol;
      auth_key?: string;
      priv_protocol?: PrivProtocol;
      priv_key?: string;
    };

/** Lo que ve el portal — nunca un `*_enc` ni material de clave. */
export interface MaskedCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  username?: string;
  security_level?: SecurityLevel;
  auth_protocol?: AuthProtocol;
  priv_protocol?: PrivProtocol;
  has_community: boolean;
  has_auth_key: boolean;
  has_priv_key: boolean;
}

/** Lo que recibe el agente por heartbeat — descifrado. */
export type WireCredential =
  | { id: string; version: "v1" | "v2c"; community: string }
  | {
      id: string;
      version: "v3";
      username: string;
      security_level: SecurityLevel;
      auth_protocol?: AuthProtocol;
      auth_key?: string;
      priv_protocol?: PrivProtocol;
      priv_key?: string;
    };

export class SnmpCredentialValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

const AUTH_PROTOCOLS: readonly AuthProtocol[] = ["md5", "sha", "sha224", "sha256", "sha384", "sha512"];
const PRIV_PROTOCOLS: readonly PrivProtocol[] = ["des", "aes", "aes256b", "aes256r"];
const SECURITY_LEVELS: readonly SecurityLevel[] = ["noAuthNoPriv", "authNoPriv", "authPriv"];

/**
 * Valida la forma del body del PUT contra las reglas de USM. Lanza
 * `SnmpCredentialValidationError` con `field` para que el portal pinte el
 * campo puntual. No resuelve `ref` contra nada — eso lo hace `buildStored`.
 */
export function validateCredentials(raw: unknown): CredentialInput[] {
  if (!Array.isArray(raw)) throw new SnmpCredentialValidationError("credentials debe ser un array");
  if (raw.length > MAX_CREDENTIALS) {
    throw new SnmpCredentialValidationError(`Máximo ${MAX_CREDENTIALS} credenciales por agente`, "credentials");
  }

  return raw.map((item, i) => {
    const prefix = `credentials[${i}]`;
    if (item == null || typeof item !== "object") {
      throw new SnmpCredentialValidationError(`${prefix}: debe ser un objeto`, prefix);
    }
    const o = item as Record<string, unknown>;

    if (typeof o.ref === "string") {
      return { ref: o.ref };
    }

    const label = o.label === undefined || o.label === null ? null : String(o.label).slice(0, MAX_LABEL_LEN);

    if (o.version === "v1" || o.version === "v2c") {
      const community = typeof o.community === "string" ? o.community.trim() : "";
      if (!community) throw new SnmpCredentialValidationError(`${prefix}: community es requerida`, `${prefix}.community`);
      if (community.length > MAX_COMMUNITY_LEN) {
        throw new SnmpCredentialValidationError(`${prefix}: community supera ${MAX_COMMUNITY_LEN} caracteres`, `${prefix}.community`);
      }
      return { version: o.version, label, community };
    }

    if (o.version === "v3") {
      const username = typeof o.username === "string" ? o.username.trim() : "";
      if (!username) throw new SnmpCredentialValidationError(`${prefix}: username es requerido`, `${prefix}.username`);

      const level = o.security_level as SecurityLevel;
      if (!SECURITY_LEVELS.includes(level)) {
        throw new SnmpCredentialValidationError(`${prefix}: security_level inválido`, `${prefix}.security_level`);
      }

      const authProtocol = o.auth_protocol as AuthProtocol | undefined;
      const authKey = typeof o.auth_key === "string" ? o.auth_key : undefined;
      const privProtocol = o.priv_protocol as PrivProtocol | undefined;
      const privKey = typeof o.priv_key === "string" ? o.priv_key : undefined;

      if (level === "noAuthNoPriv") {
        if (authProtocol || authKey || privProtocol || privKey) {
          throw new SnmpCredentialValidationError(`${prefix}: noAuthNoPriv no admite auth/priv`, `${prefix}.security_level`);
        }
      } else {
        // authNoPriv y authPriv requieren auth.
        if (!authProtocol || !AUTH_PROTOCOLS.includes(authProtocol)) {
          throw new SnmpCredentialValidationError(`${prefix}: auth_protocol inválido o faltante`, `${prefix}.auth_protocol`);
        }
        if (!authKey || authKey.length < MIN_PASSPHRASE_LEN) {
          throw new SnmpCredentialValidationError(
            `${prefix}: auth_key requiere al menos ${MIN_PASSPHRASE_LEN} caracteres (passphrase, no clave localizada)`,
            `${prefix}.auth_key`
          );
        }
        if (level === "authNoPriv") {
          if (privProtocol || privKey) {
            throw new SnmpCredentialValidationError(`${prefix}: authNoPriv no admite priv`, `${prefix}.security_level`);
          }
        } else {
          // authPriv requiere priv también.
          if (!privProtocol || !PRIV_PROTOCOLS.includes(privProtocol)) {
            throw new SnmpCredentialValidationError(`${prefix}: priv_protocol inválido o faltante`, `${prefix}.priv_protocol`);
          }
          if (!privKey || privKey.length < MIN_PASSPHRASE_LEN) {
            throw new SnmpCredentialValidationError(
              `${prefix}: priv_key requiere al menos ${MIN_PASSPHRASE_LEN} caracteres`,
              `${prefix}.priv_key`
            );
          }
        }
      }

      return { version: "v3", label, username, security_level: level, auth_protocol: authProtocol, auth_key: authKey, priv_protocol: privProtocol, priv_key: privKey };
    }

    throw new SnmpCredentialValidationError(`${prefix}: version debe ser v1, v2c o v3`, `${prefix}.version`);
  });
}

/**
 * Resuelve los `{ref}` contra la lista actual (se conservan tal cual, mismo
 * `id`, sin volver a cifrar nada) y cifra el material nuevo con un `id`
 * flamante. Requiere la clave de cifrado SÓLO si hay al menos una entrada de
 * material nuevo — un PUT que sólo reordena/borra por ref funciona sin ella.
 */
export function buildStored(input: CredentialInput[], current: StoredCredential[]): StoredCredential[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  const hasNewSecret = input.some((i) => !("ref" in i));
  if (hasNewSecret && !isEncryptionConfigured()) {
    throw new MissingEncryptionKeyError();
  }

  return input.map((item) => {
    if ("ref" in item) {
      const found = byId.get(item.ref);
      if (!found) {
        throw new SnmpCredentialValidationError(`ref "${item.ref}" no corresponde a ninguna credencial existente`, "ref");
      }
      return found;
    }

    const id = crypto.randomUUID();
    const fresh: Exclude<CredentialInput, { ref: string }> = item;
    if (fresh.version === "v3") {
      return {
        id, version: "v3" as const, label: fresh.label ?? null,
        username: fresh.username, security_level: fresh.security_level,
        auth_protocol: fresh.auth_protocol,
        auth_key_enc: fresh.auth_key ? encryptSecret(fresh.auth_key) : undefined,
        priv_protocol: fresh.priv_protocol,
        priv_key_enc: fresh.priv_key ? encryptSecret(fresh.priv_key) : undefined,
      };
    }
    return {
      id, version: fresh.version, label: fresh.label ?? null,
      community_enc: encryptSecret(fresh.community),
    };
  });
}

export function maskCredentials(stored: StoredCredential[]): MaskedCredential[] {
  return stored.map((c) => ({
    id: c.id, version: c.version, label: c.label,
    username: c.username, security_level: c.security_level,
    auth_protocol: c.auth_protocol, priv_protocol: c.priv_protocol,
    has_community: !!c.community_enc, has_auth_key: !!c.auth_key_enc, has_priv_key: !!c.priv_key_enc,
  }));
}

/**
 * Descifra para el heartbeat del agente. Una entrada individual corrupta (o
 * cifrada con una clave rotada) se salta y se loguea — no debe tirar abajo el
 * resto de la lista. Si la clave no está configurada en absoluto, lanza
 * (todas fallarían igual) — el LLAMADOR (`agentService.getConfig`) es quien
 * debe atrapar esto y omitir `snmp_credentials` del payload sin propagar un
 * 500: el heartbeat no puede romperse por esto para ningún agente.
 */
export function toWire(stored: StoredCredential[]): WireCredential[] {
  if (stored.length === 0) return [];
  if (!isEncryptionConfigured()) throw new MissingEncryptionKeyError();

  const out: WireCredential[] = [];
  for (const c of stored) {
    try {
      if (c.version === "v1" || c.version === "v2c") {
        if (!c.community_enc) continue;
        out.push({ id: c.id, version: c.version, community: decryptSecret(c.community_enc) });
      } else {
        out.push({
          id: c.id, version: "v3",
          username: c.username ?? "", security_level: c.security_level ?? "authPriv",
          auth_protocol: c.auth_protocol,
          auth_key: c.auth_key_enc ? decryptSecret(c.auth_key_enc) : undefined,
          priv_protocol: c.priv_protocol,
          priv_key: c.priv_key_enc ? decryptSecret(c.priv_key_enc) : undefined,
        });
      }
    } catch (err) {
      logger.error({ err }, `[snmpCredentials] No se pudo descifrar la credencial ${c.id} (${c.version}), se omite`);
    }
  }
  return out;
}

/**
 * `snmp_community` legacy que sigue viajando SIEMPRE en el heartbeat (agentes
 * sin actualizar sólo entienden este campo): la community de la primera
 * entrada v1/v2c de la lista, o `fallback` (la columna vieja `agents.snmp_community`)
 * si no hay ninguna o no se pudo descifrar.
 */
export function legacyCommunity(stored: StoredCredential[], fallback: string | null): string | null {
  const first = stored.find((c) => (c.version === "v1" || c.version === "v2c") && c.community_enc);
  if (first?.community_enc) {
    try {
      return decryptSecret(first.community_enc);
    } catch {
      /* cae a fallback */
    }
  }
  return fallback;
}

/** Metadata para audit_logs — NUNCA community/auth/priv, sólo lo que ya es público en el protocolo. */
export function auditMetadata(stored: StoredCredential[]): object {
  return {
    count: stored.length,
    entries: stored.map((c) => ({ id: c.id, version: c.version, label: c.label, username: c.username ?? null })),
  };
}
