import { Knex } from "knex";

/**
 * Identidad de dispositivo por cliente (docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md
 * §2.4). Reemplaza el matcher histórico de `agentService.syncReadings`
 * (`agent_id AND (ip_address = ip OR serial_number = serial)`, un OR con
 * desempate por ORDER BY que el docblock del método describía mal — la IP
 * terminaba siendo identidad de facto) por una escalera determinística
 * serial → mac → ip, scopeada por CLIENTE (no por agente).
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

/** Heurística de "modelo ruido" compartida con el merge (antes vivía inline en agentService.ts). */
export const NOISE_MODEL_RE = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;

/**
 * `true` si `raw` identifica físicamente al equipo (no es una IP disfrazada de
 * serial, ni un placeholder de firmware). `ip` es la IP reportada en la MISMA
 * lectura — un serial igual a esa IP es el patrón "sin serial real" que ya usa
 * el código actual.
 */
export function isIdentifyingSerial(raw: string | null | undefined, ip?: string | null): boolean {
  const s = (raw || "").trim();
  if (!s) return false;
  if (ip && s === ip.trim()) return false;
  // net.isIP no está disponible del lado del navegador, pero este módulo sólo
  // corre en el server — se evita el import para no acoplar innecesariamente;
  // un serial que parsea como IPv4/IPv6 se descarta igual con esta regex simple.
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

export interface ResolveIdentityParams {
  clientId: string;
  agentId: string;
  serial: string | null;
  mac: string | null;
  ip: string | null;
}

export interface ResolvedDevice {
  id: string;
  agent_id: string;
  client_id: string;
  serial_number: string | null;
  mac: string | null;
  ip_address: string | null;
  decommissioned_at: Date | null;
  last_seen: Date | null;
  agent_reassigned_at: Date | null;
  [key: string]: unknown;
}

export type MatchedBy = "serial" | "mac" | "ip" | "none";

/** Ventanas anti-flapping para el re-binding de `agent_id` (ver `resolveDeviceIdentity`). */
const AGENT_HANDOFF_GRACE_MS = 2 * 60 * 60 * 1000; // 2h sin señal del agente actual
const AGENT_REASSIGN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // techo duro: 1 reasignación/día

/**
 * Escalera determinística de resolución de identidad. Corta en el primer
 * peldaño que devuelve EXACTAMENTE una fila — 0 o 2+ filas hacen caer al
 * peldaño siguiente, nunca se adivina. Debe llamarse dentro de una
 * transacción: toma un `pg_advisory_xact_lock` sobre la clave de identidad
 * para serializar dos agentes del mismo cliente sincronizando la misma
 * impresora en paralelo, sin depender de que exista un índice único (el
 * índice único de `(client_id, serial_number)` recién se crea, condicional,
 * en la migración de dedupe).
 */
export async function resolveDeviceIdentity(
  trx: Knex.Transaction,
  { clientId, agentId, serial, mac, ip }: ResolveIdentityParams
): Promise<{ device: ResolvedDevice | null; matchedBy: MatchedBy }> {
  const realSerial = isIdentifyingSerial(serial, ip) ? (serial as string).trim() : null;
  const macN = normalizeMac(mac);

  const lockKey = realSerial
    ? `${clientId}:S:${realSerial.toUpperCase()}`
    : macN
    ? `${clientId}:M:${macN.toUpperCase()}`
    : `${agentId}:I:${ip || ""}`;
  await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [lockKey]);

  const candidateSerial = (row: ResolvedDevice): string | null =>
    isIdentifyingSerial(row.serial_number, row.ip_address) ? (row.serial_number as string) : null;
  const eqCI = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

  // ── Peldaño 1: serial, alcance CLIENTE ──────────────────────────────────
  if (realSerial) {
    const rows: ResolvedDevice[] = await trx("devices")
      .where("client_id", clientId)
      .whereRaw("upper(btrim(serial_number)) = upper(?)", [realSerial])
      .whereNull("merged_into")
      .orderBy("created_at", "asc")
      .limit(2);
    if (rows.length === 1) {
      await maybeRebindAgent(trx, rows[0], agentId);
      return { device: rows[0], matchedBy: "serial" };
    }
    // 0 o 2+ (ambiguo, sólo posible si el índice único quedó diferido por
    // colisiones sin resolver) -> cae al peldaño siguiente sin adivinar.
  }

  // ── Peldaño 2: MAC, alcance CLIENTE ─────────────────────────────────────
  if (macN) {
    const rows: ResolvedDevice[] = await trx("devices")
      .where("client_id", clientId)
      .where("mac", macN)
      .whereNull("merged_into")
      .orderByRaw("last_seen DESC NULLS LAST")
      .limit(2);
    if (rows.length === 1) {
      const cand = rows[0];
      const candSerial = candidateSerial(cand);
      // Guarda: si el candidato ya tiene un serial real DISTINTO del entrante,
      // no es la misma impresora (placa de red reutilizada / print-server
      // movido) -> no fusionar, caer al peldaño siguiente.
      if (!(realSerial && candSerial && !eqCI(candSerial, realSerial))) {
        await maybeRebindAgent(trx, cand, agentId);
        return { device: cand, matchedBy: "mac" };
      }
    }
  }

  // ── Peldaño 3: IP, alcance CLIENTE + AGENTE ─────────────────────────────
  // El agent_id es obligatorio acá: la IP no es única dentro de un cliente —
  // dos sedes del mismo cliente pueden tener ambas 192.168.1.50 apuntando a
  // impresoras distintas. Scopear sólo por cliente sería una fuga de
  // contadores entre sedes.
  if (ip) {
    const cand: ResolvedDevice | undefined = await trx("devices")
      .where("client_id", clientId)
      .where("agent_id", agentId)
      .where("ip_address", ip)
      .whereNull("merged_into")
      .orderByRaw(
        "(serial_number IS NOT NULL AND serial_number <> host(ip_address)) DESC, last_seen DESC NULLS LAST"
      )
      .first();
    if (cand) {
      const candSerial = candidateSerial(cand);
      if (realSerial && candSerial && !eqCI(candSerial, realSerial)) {
        // La IP la heredó otra impresora física (DHCP reciclado). Liberarla de
        // la fila vieja para que el próximo scan no vuelva a mentir, y dejar
        // que se cree una fila nueva para el equipo entrante. Esto es lo que
        // arregla el bug vivo: hoy esta colisión hace que finalSerial conserve
        // el serial viejo y los contadores de la impresora nueva se escriban
        // sobre la vieja (counter_reset espurio + pérdida del delta).
        await trx("devices").where("id", cand.id).update({ ip_address: null });
        await trx("audit_logs").insert({
          action: "DEVICE_IP_REASSIGNED",
          target_id: cand.id,
          user_id: null,
          ip_address: null,
          metadata: JSON.stringify({ from_serial: candSerial, to_serial: realSerial, ip, agent_id: agentId }),
        });
        return { device: null, matchedBy: "none" };
      }
      return { device: cand, matchedBy: "ip" };
    }
  }

  return { device: null, matchedBy: "none" };
}

/**
 * Re-binding de `agent_id`: sticky, no last-writer-wins. Si el equipo
 * matcheado pertenece a OTRO agente del mismo cliente, el historial se
 * unifica igual (es el punto de la feature), pero `agent_id` sólo se
 * re-apunta si el agente/equipo actual está stale y no hubo otra reasignación
 * en las últimas 24h. Sin esto, dos agentes con rangos IP solapados se
 * robarían el equipo en cada scan: alertWorker lee umbrales de tóner por
 * agent_id y alertService.openAlert no deduplica contra alertas YA resueltas,
 * así que el flapping abriría/cerraría la misma alerta por scan sin techo.
 */
async function maybeRebindAgent(trx: Knex.Transaction, device: ResolvedDevice, agentId: string): Promise<void> {
  if (device.agent_id === agentId) return;

  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : null;
  const isStale = lastSeenMs === null || Date.now() - lastSeenMs > AGENT_HANDOFF_GRACE_MS;

  const lastReassignMs = device.agent_reassigned_at ? new Date(device.agent_reassigned_at).getTime() : null;
  const cooledDown = lastReassignMs === null || Date.now() - lastReassignMs > AGENT_REASSIGN_COOLDOWN_MS;

  if (!isStale || !cooledDown) return; // sticky: se conserva el agent_id existente

  const fromAgentId = device.agent_id;
  await trx("devices")
    .where("id", device.id)
    .update({ agent_id: agentId, client_id: device.client_id, agent_reassigned_at: new Date() });
  device.agent_id = agentId;

  await trx("audit_logs").insert({
    action: "DEVICE_AGENT_REASSIGNED",
    target_id: device.id,
    user_id: null,
    ip_address: null,
    metadata: JSON.stringify({ from_agent_id: fromAgentId, to_agent_id: agentId, last_seen: device.last_seen }),
  });
}
