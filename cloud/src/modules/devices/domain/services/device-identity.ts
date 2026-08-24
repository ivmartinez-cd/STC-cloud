import type { ResolvedDevice } from "../entities/device";

/**
 * Identidad de dispositivo por cliente (gap analysis §2.4) — parte PURA de la
 * escalera serial → mac → ip. La resolución contra la base (con
 * `pg_advisory_xact_lock`) vive en `infrastructure/database/knex-device-identity-resolver.ts`.
 */

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// Denylist explícita, no heurística: se prefiere un falso "identificante"
// (crea una fila de más, corregible con un merge manual) a un falso "genérico"
// (fusiona dos impresoras físicas distintas, corrompe la facturación, es
// irreversible). Si se toca esta lista, tocar también el predicado SQL
// equivalente de la migración de dedupe (deben quedar sincronizados).
const GENERIC_SERIAL_RE = /^(unknown|n\/?a|none|null|nil|serial|s\/?n|not ?set|default)$/i;
const REPEATED_CHAR_RE = /^(.)\1*$/; // "00000000", "----", etc.
const GENERIC_NUMERIC_RE = /^(sn)?0*123456\d*$/i;

/** Heurística de "modelo ruido" compartida con el merge. */
export const NOISE_MODEL_RE = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;

/**
 * `true` si `raw` identifica físicamente al equipo (no es una IP disfrazada de
 * serial, ni un placeholder de firmware). `ip` es la IP reportada en la MISMA
 * lectura — un serial igual a esa IP es el patrón "sin serial real".
 */
export function isIdentifyingSerial(raw: string | null | undefined, ip?: string | null): boolean {
  const s = (raw || "").trim();
  if (!s) return false;
  if (ip && s === ip.trim()) return false;
  // Un serial que parsea como IPv4/IPv6 se descarta con esta regex simple
  // (sin `net.isIP` para no acoplar el módulo a Node innecesariamente).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  if (s.includes(":") && s.split(":").length >= 3) return false; // forma IPv6 grosera
  if (s.length < 5) return false;
  if (REPEATED_CHAR_RE.test(s)) return false;
  if (GENERIC_SERIAL_RE.test(s)) return false;
  if (GENERIC_NUMERIC_RE.test(s)) return false;
  return true;
}

/** Normaliza y valida una MAC. Devuelve `null` si no matchea la forma esperada. */
export function normalizeMac(raw: string | null | undefined): string | null {
  const s = (raw || "").trim();
  return MAC_RE.test(s) ? s : null;
}

/** Clave del advisory lock que serializa dos agentes del mismo cliente sincronizando la misma impresora. */
export function identityLockKey(clientId: string, agentId: string, realSerial: string | null, macN: string | null, ip: string | null): string {
  if (realSerial) return `${clientId}:S:${realSerial.toUpperCase()}`;
  if (macN) return `${clientId}:M:${macN.toUpperCase()}`;
  return `${agentId}:I:${ip || ""}`;
}

export function candidateSerial(row: ResolvedDevice): string | null {
  return isIdentifyingSerial(row.serial_number, row.ip_address) ? (row.serial_number as string) : null;
}

export function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

/** Ventanas anti-flapping para el re-binding de `agent_id`. */
const AGENT_HANDOFF_GRACE_MS = 2 * 60 * 60 * 1000; // 2h sin señal del agente actual
const AGENT_REASSIGN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // techo duro: 1 reasignación/día

/**
 * Re-binding sticky, no last-writer-wins: `agent_id` sólo se re-apunta si el
 * equipo está stale y no hubo otra reasignación en las últimas 24h. Sin esto,
 * dos agentes con rangos IP solapados se robarían el equipo en cada scan.
 */
export function shouldRebindAgent(device: ResolvedDevice, agentId: string, now = Date.now()): boolean {
  if (device.agent_id === agentId) return false;
  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : null;
  const isStale = lastSeenMs === null || now - lastSeenMs > AGENT_HANDOFF_GRACE_MS;
  const lastReassignMs = device.agent_reassigned_at ? new Date(device.agent_reassigned_at).getTime() : null;
  const cooledDown = lastReassignMs === null || now - lastReassignMs > AGENT_REASSIGN_COOLDOWN_MS;
  return isStale && cooledDown;
}
