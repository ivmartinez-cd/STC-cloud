import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import type { AgentDeviceSegment, AgentDeviceSortField } from "../../domain/entities/monitor-detail";
import type { ListAgentDeviceDirectoryInput } from "../dtos/monitor-detail-dtos";
import { AgentNotFoundError } from "./portal-agent-use-cases";

const DEVICE_SEGMENTS: ReadonlySet<string> = new Set<AgentDeviceSegment>(["sin_conexion", "con_alertas", "sin_aprobar"]);
const DEVICE_SORT_FIELDS: ReadonlySet<string> = new Set<AgentDeviceSortField>(["alerts_count", "consumible_pct", "last_seen"]);

function normalizeSegment(segment?: string): AgentDeviceSegment | undefined {
  return segment && DEVICE_SEGMENTS.has(segment) ? (segment as AgentDeviceSegment) : undefined;
}
function normalizeSortField(sortField?: string): AgentDeviceSortField {
  return sortField && DEVICE_SORT_FIELDS.has(sortField) ? (sortField as AgentDeviceSortField) : "alerts_count";
}

/** Tira de 6 métricas del sitio (handoff hifi "Monitor — detalle", 25/08/2026). */
export class GetAgentStatsUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(agentId: string) {
    return this.repo.getStats(agentId);
  }
}

/** "Conectividad · últimos 30 días" — ver docblock de `ConnectivityDay` para la
 * aproximación documentada (derivada de alertas `agent_offline`, no de un log
 * estructurado día-a-día). */
export class GetAgentConnectivityUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(agentId: string) {
    return this.repo.getConnectivity30d(agentId);
  }
}

/** "Actividad reciente" — admin/operator solamente (ver `rolePolicy.ts`: mismo
 * criterio que excluir `/agents/:id/logs` de `CLIENT_VIEWER_ROUTES`, expone
 * quién hizo qué). */
export class GetAgentActivityUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(agentId: string, limit?: number) {
    return this.repo.getRecentActivity(agentId, Math.min(limit ?? 20, 50));
  }
}

/** "Licencia y vínculo" — ver docblock de `AgentLicense`. */
export class GetAgentLicenseUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  async execute(agentId: string) {
    const license = await this.repo.getLicense(agentId);
    if (!license) throw new AgentNotFoundError("Monitor no encontrado");
    return license;
  }
}

/** Tabla "Equipos detectados por este monitor" — paginada/filtrada/ordenada,
 * mismo criterio "tolerante" que `ListClientDeviceDirectoryUseCase`. */
export class ListAgentDeviceDirectoryUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(input: ListAgentDeviceDirectoryInput) {
    return this.repo.listDevicesDirectory({
      agentId: input.agentId,
      q: input.q?.trim() || undefined,
      segment: normalizeSegment(input.segment),
      sortField: normalizeSortField(input.sortField),
      sortDir: input.sortDir === "asc" ? "asc" : "desc",
      limit: input.limit, offset: input.offset,
    });
  }
}
