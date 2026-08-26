import type {
  ClientDetailStats, ClientDeviceDirectoryRow, ClientDeviceRow, ClientDeviceSegment, ClientDeviceSortField,
  ClientDirectoryRow, ClientMonitorRow, ClientPortfolioSummary, ClientRecord, ClientUsageMonth,
} from "../../domain/entities/client";
import { ClientNotFoundError, ClientValidationError } from "../../domain/errors/client-error";
import type {
  ClientDirectorySegment, ClientDirectorySortField, ClientRepository,
} from "../../domain/repositories/client-repository";
import { buildClientCreateData, buildClientUpdates } from "../../domain/services/client-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { SystemSettingsReader } from "../ports/system-settings-reader";
import type {
  ClientDevicesInput, ClientMonitorsInput, CreateClientInput, ListClientDeviceDirectoryInput, ListClientDirectoryInput,
  ListClientsInput, PortfolioSummaryInput, UpdateClientInput,
} from "../dtos/client-dtos";

const SEGMENTS: ReadonlySet<string> = new Set<ClientDirectorySegment>(["sin_contacto", "con_alertas", "sin_reporte_24h"]);
const SORT_FIELDS: ReadonlySet<string> = new Set<ClientDirectorySortField>(["monitor_count", "device_count", "alerts_count", "last_report_at"]);

function normalizeSegment(segment?: string): ClientDirectorySegment | undefined {
  return segment && SEGMENTS.has(segment) ? (segment as ClientDirectorySegment) : undefined;
}

function normalizeSortField(sortField?: string): ClientDirectorySortField {
  return sortField && SORT_FIELDS.has(sortField) ? (sortField as ClientDirectorySortField) : "device_count";
}

const DEVICE_SEGMENTS: ReadonlySet<string> = new Set<ClientDeviceSegment>(["sin_conexion", "con_alertas", "consumible_bajo"]);
const DEVICE_SORT_FIELDS: ReadonlySet<string> = new Set<ClientDeviceSortField>(["alerts_count", "consumible_pct", "last_seen"]);

function normalizeDeviceSegment(segment?: string): ClientDeviceSegment | undefined {
  return segment && DEVICE_SEGMENTS.has(segment) ? (segment as ClientDeviceSegment) : undefined;
}

function normalizeDeviceSortField(sortField?: string): ClientDeviceSortField {
  return sortField && DEVICE_SORT_FIELDS.has(sortField) ? (sortField as ClientDeviceSortField) : "alerts_count";
}

/** Casos de uso chicos agrupados por agregado (mismo criterio que `modules/inventory`). */

export class CreateClientUseCase {
  constructor(
    private readonly clients: ClientRepository,
    private readonly audit: AuditLogWriter,
    private readonly settings: SystemSettingsReader
  ) {}

  async execute(input: CreateClientInput): Promise<ClientRecord> {
    // Umbral global de consumible (Configuración del sistema, handoff hifi
    // #3) como default de `supply_request_threshold_pct` — antes el umbral
    // global se guardaba y se veía en la UI pero no conectaba con nada real;
    // esto lo hace efectivo para clientes NUEVOS (uno ya existente conserva
    // el valor que tenga, esto no es retroactivo).
    const supplyThresholdPct = await this.settings.getSupplyThresholdCriticalPct();
    const client = await this.clients.insert({
      ...buildClientCreateData(input.body),
      supply_request_threshold_pct: supplyThresholdPct,
    });
    await this.audit.write({
      action: "CLIENT_CREATED", targetId: String(client.id), userId: input.userId,
      ipAddress: input.ipAddress, metadata: { name: client.name },
    });
    return client;
  }
}

/** Orden preservado del controller original: 404 → nombre vacío 400 → nada para actualizar 400. */
export class UpdateClientUseCase {
  constructor(private readonly clients: ClientRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: UpdateClientInput): Promise<ClientRecord> {
    if (!(await this.clients.exists(input.id))) throw new ClientNotFoundError();
    const updates = buildClientUpdates(input.body);
    if (Object.keys(updates).length === 0) throw new ClientValidationError("Nada para actualizar");
    const updated = await this.clients.update(input.id, updates);
    await this.audit.write({
      action: "CLIENT_UPDATED", targetId: String(input.id), userId: input.userId,
      ipAddress: input.ipAddress, metadata: { changes: Object.keys(updates) },
    });
    return updated;
  }
}

export class ListClientsUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: ListClientsInput): Promise<ClientRecord[]> {
    return this.clients.listWithCounts(input.scope);
  }
}

/** Devuelve `null` (no 404) si no existe — comportamiento histórico de `GET /clients/:id`. */
export class GetClientUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(id: string): Promise<ClientRecord | null> {
    return this.clients.findWithCounts(id);
  }
}

export class GetClientMonitorsUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: ClientMonitorsInput): Promise<ClientMonitorRow[]> {
    return this.clients.listMonitors(input.clientId, input.scope.kind === "all");
  }
}

export class GetClientUsageUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(clientId: string): Promise<ClientUsageMonth[]> {
    return this.clients.usageByMonth(clientId);
  }
}

export class GetClientDevicesUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: ClientDevicesInput): Promise<ClientDeviceRow[]> {
    const includeDecommissioned = input.include === "decommissioned" || input.include === "all";
    return this.clients.listDevices(input.clientId, includeDecommissioned);
  }
}

/** Listado hifi de "Clientes" (handoff 25/08/2026): paginado/filtrado/ordenado, con
 * `estado`/alertas/último reporte ya resueltos por `KnexClientRepository.listDirectory()`.
 * Valores de `segment`/`sortField` fuera del enum caen al default en vez de 400 — mismo
 * criterio "tolerante" que el resto de los query strings del módulo. */
export class ListClientDirectoryUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: ListClientDirectoryInput): Promise<{ items: ClientDirectoryRow[]; total: number }> {
    return this.clients.listDirectory({
      scope: input.scope,
      q: input.q?.trim() || undefined,
      segment: normalizeSegment(input.segment),
      sortField: normalizeSortField(input.sortField),
      sortDir: input.sortDir === "asc" ? "asc" : "desc",
      limit: input.limit, offset: input.offset,
    });
  }
}

/** Tira de métricas de cartera — endpoint aparte del listado paginado (ver README del
 * handoff, "State Management" → `portfolioSummary`). */
export class GetClientPortfolioSummaryUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: PortfolioSummaryInput): Promise<ClientPortfolioSummary> {
    return this.clients.getPortfolioSummary(input.scope);
  }
}

/** Tira de métricas "requiere atención" del detalle de cliente (handoff hifi
 * "Cliente — detalle", 25/08/2026) — `managed_device_count`/alertas abiertas y de
 * disponibilidad, aparte de `findWithCounts` (ver docblock de `ClientDetailStats`). */
export class GetClientStatsUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(clientId: string): Promise<ClientDetailStats> {
    return this.clients.getClientStats(clientId);
  }
}

/** Tabla "Infraestructura de monitoreo" del detalle de cliente — paginada/filtrada/
 * ordenada, mismo criterio "tolerante" que `ListClientDirectoryUseCase`. */
export class ListClientDeviceDirectoryUseCase {
  constructor(private readonly clients: ClientRepository) {}
  execute(input: ListClientDeviceDirectoryInput): Promise<{ items: ClientDeviceDirectoryRow[]; total: number }> {
    return this.clients.listDevicesDirectory({
      clientId: input.clientId,
      q: input.q?.trim() || undefined,
      segment: normalizeDeviceSegment(input.segment),
      sortField: normalizeDeviceSortField(input.sortField),
      sortDir: input.sortDir === "asc" ? "asc" : "desc",
      limit: input.limit, offset: input.offset,
    });
  }
}
