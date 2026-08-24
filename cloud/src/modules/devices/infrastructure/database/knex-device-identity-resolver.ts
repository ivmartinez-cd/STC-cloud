import type { Knex } from "knex";
import type { MatchedBy, ResolveIdentityParams, ResolvedDevice } from "../../domain/entities/device";
import {
  candidateSerial, equalsIgnoreCase, identityLockKey, isIdentifyingSerial, normalizeMac, shouldRebindAgent,
} from "../../domain/services/device-identity";

/**
 * Escalera determinística de resolución de identidad (gap analysis §2.4).
 * Corta en el primer peldaño que devuelve EXACTAMENTE una fila — 0 o 2+ filas
 * hacen caer al peldaño siguiente, nunca se adivina. Debe llamarse dentro de
 * una transacción: toma un `pg_advisory_xact_lock` sobre la clave de
 * identidad para serializar dos agentes del mismo cliente sincronizando la
 * misma impresora en paralelo. Es parte del camino de INGESTA (la llama
 * `agentService`), por eso vive como función sobre `trx` y no como caso de
 * uso HTTP.
 */
export async function resolveDeviceIdentity(
  trx: Knex.Transaction,
  { clientId, agentId, serial, mac, ip }: ResolveIdentityParams
): Promise<{ device: ResolvedDevice | null; matchedBy: MatchedBy }> {
  const realSerial = isIdentifyingSerial(serial, ip) ? (serial as string).trim() : null;
  const macN = normalizeMac(mac);
  await trx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [identityLockKey(clientId, agentId, realSerial, macN, ip)]);

  const bySerial = realSerial ? await matchBySerial(trx, clientId, realSerial) : null;
  if (bySerial) { await maybeRebindAgent(trx, bySerial, agentId); return { device: bySerial, matchedBy: "serial" }; }

  const byMac = macN ? await matchByMac(trx, clientId, macN, realSerial) : null;
  if (byMac) { await maybeRebindAgent(trx, byMac, agentId); return { device: byMac, matchedBy: "mac" }; }

  if (ip) return matchByIp(trx, clientId, agentId, ip, realSerial);
  return { device: null, matchedBy: "none" };
}

// ── Peldaño 1: serial, alcance CLIENTE. 0 o 2+ (ambiguo) -> cae al siguiente sin adivinar.
async function matchBySerial(trx: Knex.Transaction, clientId: string, realSerial: string): Promise<ResolvedDevice | null> {
  const rows: ResolvedDevice[] = await trx("devices").where("client_id", clientId)
    .whereRaw("upper(btrim(serial_number)) = upper(?)", [realSerial]).whereNull("merged_into")
    .orderBy("created_at", "asc").limit(2);
  return rows.length === 1 ? rows[0] : null;
}

// ── Peldaño 2: MAC, alcance CLIENTE. Guarda: si el candidato ya tiene un serial
// real DISTINTO del entrante, no es la misma impresora (placa de red reutilizada).
async function matchByMac(trx: Knex.Transaction, clientId: string, macN: string, realSerial: string | null): Promise<ResolvedDevice | null> {
  const rows: ResolvedDevice[] = await trx("devices").where("client_id", clientId).where("mac", macN)
    .whereNull("merged_into").orderByRaw("last_seen DESC NULLS LAST").limit(2);
  if (rows.length !== 1) return null;
  const candSerial = candidateSerial(rows[0]);
  return realSerial && candSerial && !equalsIgnoreCase(candSerial, realSerial) ? null : rows[0];
}

// ── Peldaño 3: IP, alcance CLIENTE + AGENTE. El agent_id es obligatorio acá: la
// IP no es única dentro de un cliente (dos sedes pueden tener ambas 192.168.1.50).
async function matchByIp(
  trx: Knex.Transaction, clientId: string, agentId: string, ip: string, realSerial: string | null
): Promise<{ device: ResolvedDevice | null; matchedBy: MatchedBy }> {
  const cand: ResolvedDevice | undefined = await trx("devices")
    .where("client_id", clientId).where("agent_id", agentId).where("ip_address", ip).whereNull("merged_into")
    .orderByRaw("(serial_number IS NOT NULL AND serial_number <> host(ip_address)) DESC, last_seen DESC NULLS LAST")
    .first();
  if (!cand) return { device: null, matchedBy: "none" };
  const candSerial = candidateSerial(cand);
  if (realSerial && candSerial && !equalsIgnoreCase(candSerial, realSerial)) {
    // La IP la heredó otra impresora física (DHCP reciclado). Liberarla de la
    // fila vieja y dejar que se cree una fila nueva para el equipo entrante.
    await trx("devices").where("id", cand.id).update({ ip_address: null });
    await trx("audit_logs").insert({
      action: "DEVICE_IP_REASSIGNED", target_id: cand.id, user_id: null, ip_address: null,
      metadata: JSON.stringify({ from_serial: candSerial, to_serial: realSerial, ip, agent_id: agentId }),
    });
    return { device: null, matchedBy: "none" };
  }
  return { device: cand, matchedBy: "ip" };
}

/** Re-binding sticky de `agent_id` (regla pura en `shouldRebindAgent`). */
async function maybeRebindAgent(trx: Knex.Transaction, device: ResolvedDevice, agentId: string): Promise<void> {
  if (!shouldRebindAgent(device, agentId)) return;
  const fromAgentId = device.agent_id;
  await trx("devices").where("id", device.id).update({ agent_id: agentId, client_id: device.client_id, agent_reassigned_at: new Date() });
  device.agent_id = agentId;
  await trx("audit_logs").insert({
    action: "DEVICE_AGENT_REASSIGNED", target_id: device.id, user_id: null, ip_address: null,
    metadata: JSON.stringify({ from_agent_id: fromAgentId, to_agent_id: agentId, last_seen: device.last_seen }),
  });
}
