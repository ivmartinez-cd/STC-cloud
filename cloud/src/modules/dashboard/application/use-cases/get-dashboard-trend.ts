import type { DashboardTrend, TrendRange } from "../../domain/entities/dashboard-snapshot";
import { buildTrend, rangeSpec } from "../../domain/services/trend-buckets";
import type { DashboardSnapshotRepository } from "../../domain/repositories/dashboard-snapshot-repository";
import { clientIdOf, type DashboardScope } from "../../domain/entities/dashboard-scope";

/**
 * Serie histórica del panel para el rango pedido. El scope es el mismo del
 * resto del panel: un `client_viewer` ve la tendencia de su propia cuenta, no
 * la de la red.
 *
 * No calcula deltas: devuelve los puntos y el portal deriva la variación
 * (último vs. primero de la ventana) y la sparkline. Así la cifra grande y su
 * delta salen siempre de la misma serie que se está dibujando, sin un segundo
 * número que pueda discrepar.
 */
export class GetDashboardTrendUseCase {
  constructor(private readonly repo: DashboardSnapshotRepository) {}

  async execute(range: TrendRange, scope: DashboardScope): Promise<DashboardTrend> {
    const { windowMs } = rangeSpec(range);
    const since = new Date(Date.now() - windowMs);
    const rows = await this.repo.snapshotsSince(since, clientIdOf(scope));
    return buildTrend(range, rows);
  }
}
