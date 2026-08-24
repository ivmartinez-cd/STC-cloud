import { AlertFilterError } from "../errors/alert-error";

/** Estado del equipo que decide si puede recibir alertas nuevas. */
export interface DeviceAlertGate {
  monitorState: string;
  registrationState: string;
}

/**
 * Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular: un equipo
 * `disabled`/`reports_only` no genera alertas nuevas (`full`/`supplies_only` sí).
 * Fase 7: tampoco un equipo `pending`/`ignored` — `pending` es la definición de
 * "todavía no es parte de la flota" (un cliente con `device_approval_required`
 * no quiere que un hallazgo de discovery le mande un mail antes de aprobarlo);
 * `ignored` es una decisión humana explícita de "esto no es un activo mío".
 */
export function deviceAcceptsAlerts(gate: DeviceAlertGate): boolean {
  const monitorOk = gate.monitorState === "full" || gate.monitorState === "supplies_only";
  const registrationOk = gate.registrationState === "registered";
  return monitorOk && registrationOk;
}

/** Máximo de `alerts.type` en la base (varchar(50)). */
export const ALERT_TYPE_MAX_LEN = 50;

export interface AlertLifecycleUpdates {
  acknowledged?: boolean;
  ackBy?: string | null;
  ackAt?: Date | null;
  resolved?: boolean;
  resolvedAt?: Date | null;
}

/**
 * Whitelist explícito de campos que un operador puede tocar — nunca el body
 * completo (mismo criterio que `createClient`/`updateUser`).
 */
export function buildLifecycleUpdates(
  userId: string | null,
  acknowledged: boolean | undefined,
  resolved: boolean | undefined,
  now: Date = new Date()
): AlertLifecycleUpdates {
  const updates: AlertLifecycleUpdates = {};
  if (acknowledged !== undefined) {
    updates.acknowledged = acknowledged;
    updates.ackBy = acknowledged ? userId : null;
    updates.ackAt = acknowledged ? now : null;
  }
  if (resolved !== undefined) {
    updates.resolved = resolved;
    updates.resolvedAt = resolved ? now : null;
  }
  return updates;
}

export function hasLifecycleUpdates(updates: AlertLifecycleUpdates): boolean {
  return Object.keys(updates).length > 0;
}

/** Nombre de la acción de auditoría según qué se tocó. */
export function lifecycleAuditAction(acknowledged: boolean | undefined, resolved: boolean | undefined): string {
  if (acknowledged !== undefined && resolved !== undefined) return "ALERT_ACK_AND_RESOLVE";
  return acknowledged !== undefined ? "ALERT_ACKNOWLEDGED" : "ALERT_RESOLVED";
}

/** Valida una lista CSV de query param contra un set de ids válidos; 400 si alguno no matchea. */
export function parseCsvOrThrow(
  raw: string | undefined,
  validIds: ReadonlySet<string>,
  paramName: string
): string[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const invalid = values.filter((v) => !validIds.has(v));
  if (invalid.length > 0) {
    throw new AlertFilterError(`${paramName} inválido: ${invalid.join(", ")}`);
  }
  return values;
}
