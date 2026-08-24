import { createHash } from "node:crypto";

/**
 * Códigos de recuperación de 2FA (Fase 6.2). Puro: la aleatoriedad entra
 * por parámetro (bytes) para que el dominio sea determinista y testeable.
 *
 * Formato XXXXX-XXXXX sobre un alfabeto sin ambigüos (sin 0/O/1/I/L):
 * 10 caracteres de 28 símbolos ≈ 48 bits de entropía por código — más que
 * suficiente para un secreto de un solo uso generado por el servidor.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".replace("L", "");
export const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 10;

export function formatRecoveryCode(bytes: Buffer): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Un TOTP son 6 dígitos; un código de recuperación es XXXXX-XXXXX. */
export function looksLikeRecoveryCode(input: string): boolean {
  return /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(input.trim());
}

export function normalizeRecoveryCode(input: string): string {
  const clean = input.trim().toUpperCase().replace(/-/g, "");
  return `${clean.slice(0, 5)}-${clean.slice(5)}`;
}

/** SHA-256 hex — hash rápido correcto para secretos de alta entropía del servidor. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
