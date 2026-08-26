import crypto from "crypto";

/**
 * Cifrado at-rest genérico para credenciales de terceros guardadas en
 * Postgres (Fase 19: generalizado desde el original, que sólo servía a
 * SNMPv3 — ver `snmpCredentials.ts`). Es código NUEVO en su momento: el repo
 * no cifraba nada más en Postgres antes de esto (JWT_SECRET vive en env,
 * nunca en una columna).
 *
 * Deliberadamente NO reusa el esquema de `agent/src/core/security.ts` (PBKDF2
 * con 210.000 iteraciones + salt por registro): ese costo es correcto para
 * descifrar un `config.enc` una vez al arrancar el agente, pero acá el
 * descifrado corre en el path del heartbeat — cada agente activo, cada 60s.
 * La clave se deriva UNA sola vez por `purpose` con HKDF y se cachea en
 * memoria; después AES-256-GCM sobre ~200 bytes es microsegundos.
 *
 * `purpose` deriva una subclave DISTINTA por tipo de credencial a partir de
 * la MISMA env var de entrada (`SNMP_CREDENTIALS_KEY` — el nombre quedó del
 * primer uso, ver más abajo por qué no se renombra) — así que un secreto
 * SFTP nunca se descifra con la subclave derivada para SNMP ni viceversa,
 * aunque compartan la clave raíz. `"snmp"` es el purpose implícito (default)
 * para no tocar ningún call-site existente de `snmpCredentials.ts`: mismo
 * `HKDF_INFO` que tenía el código original, así que las credenciales SNMP ya
 * cifradas siguen descifrando igual, sin necesidad de una migración de datos.
 */

const ENV_VAR = "SNMP_CREDENTIALS_KEY";
const HKDF_SALT = "stc-snmp-cred-v1";
// Nombre de la env var sin cambiar a propósito: renombrarla rompería
// `.env.production` ya desplegados que la tengan seteada — el `purpose`
// resuelve la generalización sin ese costo operativo.
const PURPOSE_INFO: Record<string, string> = {
  snmp: "stc-snmp-cred-encryption-key", // valor original — NO tocar, ya hay datos cifrados con esto
  sftp: "stc-sftp-cred-encryption-key",
};

export class MissingEncryptionKeyError extends Error {
  readonly code = "SNMP_KEY_NOT_CONFIGURED";
  constructor(purpose = "snmp") {
    super(
      `${ENV_VAR} no está configurada — no se pueden guardar credenciales nuevas (${purpose}). ` +
        `Reordenar/renombrar/borrar entradas existentes no la requiere.`
    );
  }
}

export class DecryptionFailedError extends Error {
  readonly code = "SNMP_DECRYPT_FAILED";
  constructor(cause?: unknown) {
    super(`No se pudo descifrar el secreto (clave rotada/perdida, o dato corrupto): ${String(cause)}`);
  }
}

const cachedKeys = new Map<string, Buffer | null>(); // purpose -> clave derivada (null = env var no seteada)

/**
 * Deriva la clave de cifrado UNA sola vez por `purpose` (HKDF-SHA256, 32
 * bytes) y la cachea. `null` si `SNMP_CREDENTIALS_KEY` no está seteada —
 * nunca lanza acá, el chequeo de arranque en `server.ts` sólo loggea un
 * warning (ver `isEncryptionConfigured`), no aborta el boot: la mayoría de
 * las instalaciones nunca va a usar SNMPv3 ni SFTP.
 */
function getKey(purpose: string): Buffer | null {
  if (cachedKeys.has(purpose)) return cachedKeys.get(purpose)!;
  const raw = process.env[ENV_VAR];
  if (!raw || !raw.trim()) {
    cachedKeys.set(purpose, null);
    return null;
  }
  const info = PURPOSE_INFO[purpose] ?? `stc-${purpose}-cred-encryption-key`;
  // HKDF acepta cualquier longitud/formato de secreto de entrada — no importa
  // si Render generó un string arbitrario en vez de exactamente 32 bytes.
  const derived = crypto.hkdfSync("sha256", Buffer.from(raw, "utf8"), Buffer.from(HKDF_SALT), Buffer.from(info), 32);
  const key = Buffer.from(derived);
  cachedKeys.set(purpose, key);
  return key;
}

/** `true` si hay una clave configurada y usable para ese `purpose`. Nunca lanza — para chequeos previos (warning de boot, 503 temprano). */
export function isEncryptionConfigured(purpose = "snmp"): boolean {
  return getKey(purpose) !== null;
}

/** Sólo para tests: fuerza a re-derivar todas las claves en la próxima llamada (la env var puede cambiar entre tests). */
export function _resetKeyCacheForTests(): void {
  cachedKeys.clear();
}

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/**
 * `"v1:<base64(iv[12] || authTag[16] || ciphertext)>"`. El prefijo de versión
 * está desde el día uno para no bloquear una rotación de clave futura (no se
 * implementa el mecanismo de rotación en esta pasada, sólo se deja el lugar).
 */
export function encryptSecret(plaintext: string, purpose = "snmp"): string {
  const key = getKey(purpose);
  if (!key) throw new MissingEncryptionKeyError(purpose);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, authTag, ct]).toString("base64")}`;
}

/** Lanza `MissingEncryptionKeyError`/`DecryptionFailedError` — nunca devuelve basura silenciosamente. */
export function decryptSecret(blob: string, purpose = "snmp"): string {
  const key = getKey(purpose);
  if (!key) throw new MissingEncryptionKeyError(purpose);

  const idx = blob.indexOf(":");
  const version = idx >= 0 ? blob.slice(0, idx) : "";
  if (version !== "v1") {
    throw new DecryptionFailedError(`prefijo de versión desconocido: "${version}"`);
  }
  try {
    const raw = Buffer.from(blob.slice(idx + 1), "base64");
    const iv = raw.subarray(0, IV_LEN);
    const authTag = raw.subarray(IV_LEN, IV_LEN + 16);
    const ct = raw.subarray(IV_LEN + 16);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (err) {
    throw new DecryptionFailedError(err);
  }
}
