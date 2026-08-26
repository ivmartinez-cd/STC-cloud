import { decryptSecret, encryptSecret, isEncryptionConfigured, MissingEncryptionKeyError } from "./cryptoService";
import { logger } from "../logger";

export type {
  MaskedSftpDestination, SftpAuthMethod, SftpDestinationInput, StoredSftpDestination, WireSftpDestination,
} from "../shared/domain/sftp-destination";
import type {
  MaskedSftpDestination, SftpDestinationInput, StoredSftpDestination, WireSftpDestination,
} from "../shared/domain/sftp-destination";

const PURPOSE = "sftp";
const MAX_HOST_LEN = 255;
const MAX_USERNAME_LEN = 100;
const MAX_REMOTE_PATH_LEN = 500;
const MIN_PASSWORD_LEN = 1; // el operador del SFTP del cliente define su propia política, no nosotros
const MIN_PRIVATE_KEY_LEN = 32; // una clave PEM real siempre supera esto por lejos — sólo descarta strings vacíos/basura obvia

export class SftpDestinationValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

/**
 * Valida la forma del body del PUT. Lanza `SftpDestinationValidationError`
 * con `field` para que el portal pinte el campo puntual. No cifra nada acá —
 * eso lo hace `buildStored`.
 */
export function validateSftpDestination(raw: unknown): SftpDestinationInput {
  if (raw == null || typeof raw !== "object") {
    throw new SftpDestinationValidationError("El destino SFTP debe ser un objeto");
  }
  const o = raw as Record<string, unknown>;

  const host = typeof o.host === "string" ? o.host.trim() : "";
  if (!host) throw new SftpDestinationValidationError("host es requerido", "host");
  if (host.length > MAX_HOST_LEN) throw new SftpDestinationValidationError(`host supera ${MAX_HOST_LEN} caracteres`, "host");

  const port = o.port === undefined ? 22 : Number(o.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SftpDestinationValidationError("port debe ser un entero entre 1 y 65535", "port");
  }

  const username = typeof o.username === "string" ? o.username.trim() : "";
  if (!username) throw new SftpDestinationValidationError("username es requerido", "username");
  if (username.length > MAX_USERNAME_LEN) {
    throw new SftpDestinationValidationError(`username supera ${MAX_USERNAME_LEN} caracteres`, "username");
  }

  const remotePathRaw = typeof o.remote_path === "string" ? o.remote_path.trim() : "";
  if (remotePathRaw.length > MAX_REMOTE_PATH_LEN) {
    throw new SftpDestinationValidationError(`remote_path supera ${MAX_REMOTE_PATH_LEN} caracteres`, "remote_path");
  }
  const remotePath = remotePathRaw || "/";

  if (o.auth_method === "password") {
    const password = typeof o.password === "string" ? o.password : "";
    if (password.length < MIN_PASSWORD_LEN) {
      throw new SftpDestinationValidationError("password es requerida para auth_method \"password\"", "password");
    }
    if (o.private_key) {
      throw new SftpDestinationValidationError("auth_method \"password\" no admite private_key", "auth_method");
    }
    return { host, port, username, auth_method: "password", password, remote_path: remotePath };
  }

  if (o.auth_method === "private_key") {
    const privateKey = typeof o.private_key === "string" ? o.private_key : "";
    if (privateKey.length < MIN_PRIVATE_KEY_LEN) {
      throw new SftpDestinationValidationError("private_key inválida o demasiado corta", "private_key");
    }
    if (o.password) {
      throw new SftpDestinationValidationError("auth_method \"private_key\" no admite password", "auth_method");
    }
    return { host, port, username, auth_method: "private_key", private_key: privateKey, remote_path: remotePath };
  }

  throw new SftpDestinationValidationError("auth_method debe ser \"password\" o \"private_key\"", "auth_method");
}

/**
 * Cifra el material nuevo. A diferencia de `snmpCredentials.buildStored`, acá
 * NO hay `ref` — el PUT siempre reemplaza el destino entero (un solo objeto,
 * no una lista), así que un cambio de host/usuario sin tocar la contraseña
 * todavía requiere reenviar la contraseña (el portal la pide de nuevo en el
 * form de edición, nunca la precompleta — mismo criterio "write-only" que un
 * secret de webhook).
 */
export function buildStoredSftpDestination(input: SftpDestinationInput): StoredSftpDestination {
  if (!isEncryptionConfigured(PURPOSE)) throw new MissingEncryptionKeyError(PURPOSE);
  const base = {
    host: input.host, port: input.port ?? 22, username: input.username,
    remote_path: input.remote_path || "/", updated_at: new Date().toISOString(),
  };
  if (input.auth_method === "password") {
    return { ...base, auth_method: "password", password_enc: encryptSecret(input.password!, PURPOSE) };
  }
  return { ...base, auth_method: "private_key", private_key_enc: encryptSecret(input.private_key!, PURPOSE) };
}

export function maskSftpDestination(stored: StoredSftpDestination | null): MaskedSftpDestination | null {
  if (!stored) return null;
  return {
    configured: true, host: stored.host, port: stored.port, username: stored.username,
    auth_method: stored.auth_method, remote_path: stored.remote_path, updated_at: stored.updated_at,
  };
}

/**
 * Descifra para el worker de entrega. Nunca cruza al portal — sólo lo
 * consume `services/sftpDeliveryService.ts` en el momento de conectar.
 */
export function toWireSftpDestination(stored: StoredSftpDestination): WireSftpDestination {
  if (!isEncryptionConfigured(PURPOSE)) throw new MissingEncryptionKeyError(PURPOSE);
  const base = { host: stored.host, port: stored.port, username: stored.username, remotePath: stored.remote_path };
  try {
    if (stored.auth_method === "password" && stored.password_enc) {
      return { ...base, password: decryptSecret(stored.password_enc, PURPOSE) };
    }
    if (stored.auth_method === "private_key" && stored.private_key_enc) {
      return { ...base, privateKey: decryptSecret(stored.private_key_enc, PURPOSE) };
    }
  } catch (err) {
    logger.error({ err }, "[sftpDestination] No se pudo descifrar el destino SFTP, se omite la entrega");
    throw err;
  }
  throw new Error("Destino SFTP mal formado: sin password_enc ni private_key_enc para su auth_method");
}

/** Metadata para audit_logs — NUNCA password/private_key ni sus `*_enc`. */
export function auditMetadata(stored: StoredSftpDestination | null): Record<string, unknown> {
  if (!stored) return { configured: false };
  return { configured: true, host: stored.host, port: stored.port, username: stored.username, auth_method: stored.auth_method, remote_path: stored.remote_path };
}
