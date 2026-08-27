import crypto from "crypto";

/**
 * Genera un hash seguro usando PBKDF2/scrypt con sal aleatoria.
 * El formato retornado es 'salt:hash' para facilitar almacenamiento.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Compara una contraseña plana con un hash almacenado de forma segura
 * usando comparación en tiempo constante (timingSafeEqual) para evitar timing attacks.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const verifyHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
  } catch {
    return false;
  }
}
