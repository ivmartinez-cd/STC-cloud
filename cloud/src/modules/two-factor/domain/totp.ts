import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) implementado puro sobre node:crypto — sin dependencia
 * externa: son ~40 líneas auditables y el test trae los vectores oficiales
 * del RFC. SHA-1, paso de 30s y 6 dígitos: los defaults que asumen Google
 * Authenticator / Authy / 1Password cuando leen un otpauth:// sin params.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Carácter base32 inválido: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, "0");
}

export function totpAt(secretBase32: string, epochMs: number): string {
  const counter = Math.floor(epochMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verifica con ventana de ±1 paso (tolera reloj del teléfono corrido hasta
 * 30s en cualquier dirección — el balance estándar entre UX y superficie).
 * Comparación en tiempo constante.
 */
export function verifyTotp(secretBase32: string, code: string, epochMs: number): boolean {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const provided = Buffer.from(clean);
  for (const windowStep of [0, -1, 1]) {
    const expected = totpAt(secretBase32, epochMs + windowStep * TOTP_STEP_SECONDS * 1000);
    if (timingSafeEqual(provided, Buffer.from(expected))) return true;
  }
  return false;
}

/** URI otpauth:// estándar para el QR de enrolamiento. */
export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
}
