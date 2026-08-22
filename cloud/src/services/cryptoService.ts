import crypto from "crypto";

/**
 * Cifrado at-rest para secretos SNMPv3 (auth_key/priv_key/community de la
 * lista de credenciales — ver `snmpCredentials.ts`). Es código NUEVO: el repo
 * no cifra nada más en Postgres hoy (JWT_SECRET vive en env, nunca en una
 * columna).
 *
 * Deliberadamente NO reusa el esquema de `agent/src/core/security.ts` (PBKDF2
 * con 210.000 iteraciones + salt por registro): ese costo es correcto para
 * descifrar un `config.enc` una vez al arrancar el agente, pero acá el
 * descifrado corre en el path del heartbeat — cada agente activo, cada 60s.
 * La clave se deriva UNA sola vez con HKDF y se cachea en memoria; después
 * AES-256-GCM sobre ~200 bytes es microsegundos.
 */

const ENV_VAR = "SNMP_CREDENTIALS_KEY";
const HKDF_SALT = "stc-snmp-cred-v1";
const HKDF_INFO = "stc-snmp-cred-encryption-key";

export class MissingEncryptionKeyError extends Error {
  readonly code = "SNMP_KEY_NOT_CONFIGURED";
  constructor() {
    super(
      `${ENV_VAR} no está configurada — no se pueden guardar credenciales SNMP nuevas. ` +
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

let cachedKey: Buffer | null | undefined; // undefined = todavía no se intentó derivar

/**
 * Deriva la clave de cifrado UNA sola vez (HKDF-SHA256, 32 bytes) y la cachea.
 * `undefined` si `SNMP_CREDENTIALS_KEY` no está seteada — nunca lanza acá, el
 * chequeo de arranque en `server.ts` sólo loggea un warning (ver
 * `isEncryptionConfigured`), no aborta el boot: la mayoría de las
 * instalaciones nunca va a usar SNMPv3.
 */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env[ENV_VAR];
  if (!raw || !raw.trim()) {
    cachedKey = null;
    return null;
  }
  // HKDF acepta cualquier longitud/formato de secreto de entrada — no importa
  // si Render generó un string arbitrario en vez de exactamente 32 bytes.
  const derived = crypto.hkdfSync("sha256", Buffer.from(raw, "utf8"), Buffer.from(HKDF_SALT), Buffer.from(HKDF_INFO), 32);
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

/** `true` si hay una clave configurada y usable. Nunca lanza — para chequeos previos (warning de boot, 503 temprano). */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/** Sólo para tests: fuerza a re-derivar la clave en la próxima llamada (la env var puede cambiar entre tests). */
export function _resetKeyCacheForTests(): void {
  cachedKey = undefined;
}

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/**
 * `"v1:<base64(iv[12] || authTag[16] || ciphertext)>"`. El prefijo de versión
 * está desde el día uno para no bloquear una rotación de clave futura (no se
 * implementa el mecanismo de rotación en esta pasada, sólo se deja el lugar).
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) throw new MissingEncryptionKeyError();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, authTag, ct]).toString("base64")}`;
}

/** Lanza `MissingEncryptionKeyError`/`DecryptionFailedError` — nunca devuelve basura silenciosamente. */
export function decryptSecret(blob: string): string {
  const key = getKey();
  if (!key) throw new MissingEncryptionKeyError();

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
