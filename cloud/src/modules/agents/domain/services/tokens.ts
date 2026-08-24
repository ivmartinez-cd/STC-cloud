import crypto from "crypto";

/** Hash SHA-256 de un token para almacenamiento seguro (refresh tokens nunca se guardan en claro). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Llave de activación criptográfica de un solo uso (64 chars hex), expira en 24 horas. */
export function newActivationKey(): { key: string; expiresAt: Date } {
  return { key: crypto.randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(64).toString("hex");
  return { token, hash: hashToken(token) };
}

export function newAgentId(): string {
  return crypto.randomUUID();
}

export function isActivationExpired(expiresAt: Date | string | null): boolean {
  return !!expiresAt && new Date(expiresAt) < new Date();
}
