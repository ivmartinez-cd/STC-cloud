import type { BulkSkip, DeviceRow, MonitorState } from "../entities/device";
import { BulkActionError, DeviceRegistrationError, DeviceValidationError, MonitorStateError } from "../errors/device-error";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeviceUpdateBody {
  name?: string | null;
  location?: string | null;
  asset_number?: string | null;
  asset_tag?: string | null;
  duty_cycle_monthly?: number | null;
  custom_data?: Record<string, unknown>;
}

/**
 * Whitelist de edición manual. "" o null → vuelve al valor reportado por el
 * agente (el COALESCE de la columna generada ya lo resuelve con el override en
 * NULL). `custom_data` NO se resuelve acá: lo valida/mergea el módulo
 * `inventory` a través del puerto `CustomFieldMerger`.
 */
export function buildDeviceUpdates(body: DeviceUpdateBody): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name_override = body.name?.trim() || null;
  if (body.location !== undefined) updates.location_override = body.location?.trim() || null;
  if (body.asset_number !== undefined) updates.asset_number_override = body.asset_number?.trim() || null;
  if (body.asset_tag !== undefined) updates.asset_tag = body.asset_tag?.trim() || null;
  if (body.duty_cycle_monthly !== undefined) updates.duty_cycle_monthly_override = body.duty_cycle_monthly;
  return updates;
}

export function requireReason(reason: string | undefined, message = "El motivo es obligatorio"): string {
  if (!reason || !reason.trim()) throw new DeviceValidationError(message);
  return reason.trim();
}

const VALID_MONITOR_STATES: ReadonlySet<string> = new Set<MonitorState>(["full", "supplies_only", "reports_only", "disabled"]);

export function assertMonitorState(state: string): asserts state is MonitorState {
  if (!VALID_MONITOR_STATES.has(state)) {
    throw new MonitorStateError(`state inválido: debe ser uno de ${[...VALID_MONITOR_STATES].join(", ")}`);
  }
}

/** Días de inactividad para la purga por agente: entre 7 y 365, default 30. */
export function staleCutoff(inactiveDays: number | undefined, now = Date.now()): { days: number; cutoff: Date } {
  const days = Math.min(365, Math.max(7, inactiveDays ?? 30));
  return { days, cutoff: new Date(now - days * 24 * 60 * 60 * 1000) };
}

export const MAX_BULK_DEVICE_IDS = 500;

export function assertBulkIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new BulkActionError("ids es requerido");
  if (ids.length > MAX_BULK_DEVICE_IDS) throw new BulkActionError(`ids no puede tener más de ${MAX_BULK_DEVICE_IDS} elementos`);
}

export function assertRegistrationIds(ids: string[]): void {
  if (ids.length === 0) throw new DeviceRegistrationError("deviceIds no puede estar vacío");
  if (ids.length > MAX_BULK_DEVICE_IDS) throw new DeviceRegistrationError(`deviceIds no puede tener más de ${MAX_BULK_DEVICE_IDS} elementos`);
}

/** Clasificación pura de un lote para dar de baja: applied/skipped con motivo. */
export function classifyForDecommission(ids: string[], byId: Map<string, DeviceRow>) {
  const applied: string[] = [];
  const skipped: BulkSkip[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
    if (row.decommissioned_at) { skipped.push({ id, reason: "already_decommissioned" }); continue; }
    applied.push(id);
  }
  return { applied, skipped };
}

export function classifyForRecommission(ids: string[], byId: Map<string, DeviceRow>) {
  const applied: string[] = [];
  const skipped: BulkSkip[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
    if (!row.decommissioned_at) { skipped.push({ id, reason: "not_decommissioned" }); continue; }
    applied.push(id);
  }
  return { applied, skipped };
}

/** Primer paso del move en bloque: elegibles vs. skipped antes de chequear colisiones de serial. */
export function classifyForMove(
  ids: string[], byId: Map<string, DeviceRow>, agentId: string, targetClientId: string, confirmClientChange: boolean | undefined
) {
  const eligible: DeviceRow[] = [];
  const skipped: BulkSkip[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
    if (row.agent_id === agentId) { skipped.push({ id, reason: "same_agent" }); continue; }
    if (row.client_id !== targetClientId && !confirmClientChange) { skipped.push({ id, reason: "confirm_required" }); continue; }
    eligible.push(row);
  }
  return { eligible, skipped };
}

/** Único client_id del lote (para el audit), o null si el lote cruza clientes. */
export function singleClientIdOf(ids: string[], byId: Map<string, DeviceRow>): string | null {
  const clientIds = new Set(ids.map((id) => byId.get(id)?.client_id).filter(Boolean));
  return clientIds.size === 1 ? ([...clientIds][0] as string) : null;
}
