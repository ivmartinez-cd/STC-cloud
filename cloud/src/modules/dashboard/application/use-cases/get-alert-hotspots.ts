import type { AlertHotspot, AlertHotspots, HotspotKind } from "../../domain/entities/alert-hotspot";
import { clientIdOf, type DashboardScope } from "../../domain/entities/dashboard-scope";
import type { AlertHotspotsRepository, HotspotTopRow } from "../../domain/repositories/alert-hotspots-repository";

const LIMIT = 5;

/** "ISSN · Piso 3 · SN CNB9K12345" — se saltean los tramos que el equipo no tiene. */
function deviceMeta(client: string | null, place: string | null, serial: string | null): string {
  return [client, place, serial ? `SN ${serial}` : null].filter(Boolean).join(" · ");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Panel "Dónde se concentran las alertas" (handoff "Panel de control",
 * 16/09/2026): las 5 filas que explican de dónde sale el número grande, con la
 * acción de cada una a un clic.
 *
 * El `href` apunta siempre a un destino ya resuelto — nunca a una pantalla que
 * el usuario tenga que volver a filtrar a mano.
 */
export class GetAlertHotspotsUseCase {
  constructor(private readonly repo: AlertHotspotsRepository) {}

  async execute(by: HotspotKind, scope: DashboardScope): Promise<AlertHotspots> {
    const clientId = clientIdOf(scope);
    const [rows, totals] = await Promise.all([
      this.repo.top(by, clientId, LIMIT),
      this.repo.totals(by, clientId),
    ]);
    const classes = await this.repo.classesFor(by, rows.map((r) => r.id));
    const items = rows.map((r) => toHotspot(by, r, classes.get(r.id) ?? {}));
    return { by, items, total: totals.total, universe: totals.universe };
  }
}

// Equipo → su listado de alertas ya filtrado. Cuenta → la ficha del cliente,
// que ya trae su propio resumen: para una cuenta entera "abrir la cuenta" es el
// paso siguiente real, no una lista de 243 alertas sueltas.
function toHotspot(by: HotspotKind, r: HotspotTopRow, byClass: Record<string, number>): AlertHotspot {
  const isDevice = by === "device";
  return {
    id: r.id,
    name: r.name ?? "(sin nombre)",
    meta: isDevice
      ? deviceMeta(r.meta_a, r.meta_b, r.serial ?? null)
      : `${plural(Number(r.meta_a ?? 0), "dispositivo", "dispositivos")} · ${plural(Number(r.meta_b ?? 0), "ubicación", "ubicaciones")}`,
    count: Number(r.count),
    byClass,
    href: isDevice ? `/alerts?device_id=${r.id}&resolved=false` : `/clients/${r.id}`,
  };
}
