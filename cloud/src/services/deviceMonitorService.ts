import { Knex } from "knex";
import { writeAudit } from "./auditService";

export type MonitorState = "full" | "supplies_only" | "reports_only" | "disabled";

const VALID_STATES: ReadonlySet<MonitorState> = new Set(["full", "supplies_only", "reports_only", "disabled"]);

export class MonitorStateError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Punto único para cambiar `devices.monitor_state` (Fase 5 del gap analysis
 * vs HP SDS) — reusado por el endpoint single (`PUT /devices/:id/monitor-state`)
 * y, cuando llegue la Fase 9, por la acción en bloque
 * `POST /devices/bulk/monitor-state`, para que los dos caminos no diverjan
 * (mismo criterio que motivó extraer `mergeDevices` a `deviceLifecycleService.ts`).
 */
export async function setMonitorState(
  db: Knex,
  params: { deviceId: string; state: string; reason?: string | null; actorId?: string | null; ip?: string | null }
): Promise<Record<string, unknown> | null> {
  const { deviceId, state, reason, actorId, ip } = params;
  if (!VALID_STATES.has(state as MonitorState)) {
    throw new MonitorStateError(`state inválido: debe ser uno de ${[...VALID_STATES].join(", ")}`);
  }

  const device = await db("devices").where({ id: deviceId }).first();
  if (!device) return null;
  if (device.merged_into) {
    throw new MonitorStateError("No se puede cambiar el estado de monitoreo de un registro fusionado", 409);
  }

  const [updated] = await db("devices")
    .where({ id: deviceId })
    .update({
      monitor_state: state,
      monitor_state_changed_at: new Date(),
      monitor_state_changed_by: actorId ?? null,
      monitor_state_reason: reason?.trim() || null,
    })
    .returning("*");

  await writeAudit(db, {
    action: "DEVICE_MONITOR_STATE_CHANGED",
    targetId: deviceId,
    clientId: device.client_id,
    userId: actorId ?? null,
    ip: ip ?? null,
    metadata: { from: device.monitor_state, to: state, reason: reason?.trim() || null },
  });

  return updated;
}
