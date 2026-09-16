import type { ClientSnapshot, DashboardSnapshotRepository } from "../../domain/repositories/dashboard-snapshot-repository";

/** Umbral de "monitor en línea" — el mismo que usa `/dashboard` para `agents.online`. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Consumibles en alerta de un cliente. `null` si no se pudo medir. */
export interface SuppliesProbe {
  (clientId: string): Promise<{ critical: number; low: number } | null>;
}

/**
 * Toma la muestra horaria que alimenta la tendencia del panel de control
 * (handoff 16/09/2026). Una fila por cliente, con el instante truncado a la
 * hora para que dos réplicas o un reintento escriban la misma fila en vez de
 * dos casi-iguales.
 *
 * Cualquier métrica que falle queda en `null` — es el valor que el lector
 * entiende como "esta toma no midió esto" y el portal como "no hay serie". Se
 * prefiere una toma incompleta a no escribir nada: las que sí se midieron
 * siguen siendo ciertas.
 */
export class CaptureDashboardSnapshotUseCase {
  constructor(
    private readonly repo: DashboardSnapshotRepository,
    private readonly suppliesOf: SuppliesProbe
  ) {}

  async execute(now = new Date()): Promise<number> {
    const at = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const [clientIds, alerts, devices, agents] = await Promise.all([
      this.repo.allClientIds(),
      this.repo.openAlertsByClientAndClass(),
      this.repo.deviceCountsByClient(),
      this.repo.agentCountsByClient(new Date(now.getTime() - ONLINE_WINDOW_MS)),
    ]);
    const rows: ClientSnapshot[] = [];
    for (const clientId of clientIds) {
      rows.push(await this.rowFor(clientId, alerts, devices, agents));
    }
    await this.repo.saveSnapshots(at, rows);
    return rows.length;
  }

  private async rowFor(
    clientId: string,
    alerts: Map<string, Record<string, number>>,
    devices: Map<string, { total: number; managed: number }>,
    agents: Map<string, { total: number; online: number }>
  ): Promise<ClientSnapshot> {
    const device = devices.get(clientId);
    const agent = agents.get(clientId);
    const supplies = await this.suppliesOf(clientId).catch(() => null);
    return {
      clientId,
      alertsByClass: alerts.get(clientId) ?? {},
      devicesTotal: device?.total ?? 0,
      devicesManaged: device?.managed ?? 0,
      agentsTotal: agent?.total ?? 0,
      agentsOnline: agent?.online ?? 0,
      suppliesCritical: supplies?.critical ?? null,
      suppliesLow: supplies?.low ?? null,
    };
  }
}
