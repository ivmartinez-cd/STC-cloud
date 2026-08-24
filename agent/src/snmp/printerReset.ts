import type { SetOutcome } from '../capture/transport/snmp';

/**
 * Reinicio remoto de la impresora vía SNMP SET (agente v1.2.0 — el
 * "reinicio de dispositivo" que el módulo de acciones remotas del cloud
 * dejó preparado en la Fase 4.6 del gap analysis vs HP SDS).
 *
 * `prtGeneralReset` es un objeto ESTÁNDAR de Printer-MIB (RFC 3805,
 * `prtGeneralTable`, primera y casi siempre única fila del subagente de
 * impresión → índice `.1`). No es un OID inventado por marca: es el mismo
 * objeto que HP SDS y cualquier gestor RFC-compliant usan para esto.
 *
 * Sin embargo, a diferencia de los OIDs de lectura del resto del agente,
 * este NO tiene un fixture real que lo valide contra hardware (no hay forma
 * segura de "simular" una escritura contra un dispositivo real en este
 * entorno) — la clasificación de error de `SnmpClient.setInt` es lo que
 * hace seguro este disparo: si el device no lo soporta o no tiene permiso,
 * vuelve un motivo explícito en vez de fallar en silencio o asumir éxito.
 */
export const PRT_GENERAL_RESET_OID = '1.3.6.1.2.1.43.5.1.1.3.1';

/** Valores de `PrtGeneralResetTC` (RFC 3805) — powerCycleReset es el que
 *  más se acerca a "reiniciá el equipo" sin tocar configuración/NVRAM. */
export const PRT_RESET_POWER_CYCLE = 2;

export interface RestartOutcome {
  ok: boolean;
  reason?: 'no-response' | 'no-write-permission' | 'device-error';
  detail?: string;
}

/** Puerto mínimo — lo implementa `SnmpClient.setInt`, inyectado para testear sin red real. */
export interface PrinterResetter {
  setInt(oid: string, value: number): Promise<SetOutcome>;
}

export async function restartPrinter(snmp: PrinterResetter): Promise<RestartOutcome> {
  const outcome = await snmp.setInt(PRT_GENERAL_RESET_OID, PRT_RESET_POWER_CYCLE);
  if (outcome.ok) return { ok: true };
  return { ok: false, reason: outcome.reason, detail: outcome.detail };
}
