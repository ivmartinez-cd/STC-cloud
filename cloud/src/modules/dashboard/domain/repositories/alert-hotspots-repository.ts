import type { HotspotKind } from "../entities/alert-hotspot";

/** Fila cruda del top: el nombre y la meta ya resueltos por la consulta. */
export interface HotspotTopRow {
  id: string;
  name: string | null;
  meta_a: string | null;
  meta_b: string | null;
  count: number;
  serial?: string | null;
}

export interface AlertHotspotsRepository {
  /** Top-N por alertas activas, agrupado por equipo o por cuenta. */
  top(by: HotspotKind, clientId: string | null, limit: number): Promise<HotspotTopRow[]>;
  /** Desglose por clase de los ids del top. */
  classesFor(by: HotspotKind, ids: string[]): Promise<Map<string, Record<string, number>>>;
  /** Alertas activas con equipo + cuántas entidades las tienen, en todo el scope. */
  totals(by: HotspotKind, clientId: string | null): Promise<{ total: number; universe: number }>;
}
