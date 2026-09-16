/**
 * "Dónde se concentran las alertas" (handoff "Panel de control", 16/09/2026):
 * los pocos equipos —o las pocas cuentas— que explican la mayor parte del
 * número grande de arriba.
 */

export const HOTSPOT_KINDS = ["device", "client"] as const;
export type HotspotKind = (typeof HOTSPOT_KINDS)[number];

export interface AlertHotspot {
  id: string;
  name: string;
  /** Segunda línea: cuenta · ubicación · serie (equipo) o equipos · ubicaciones (cuenta). */
  meta: string;
  count: number;
  /** Desglose por clase — el portal lo agrupa en los 3 tonos de severidad. */
  byClass: Record<string, number>;
  /** Destino de la fila: el listado de alertas ya filtrado. */
  href: string;
}

export interface AlertHotspots {
  by: HotspotKind;
  items: AlertHotspot[];
  /** Alertas activas del scope completo — el pie dice qué tajada concentran los items. */
  total: number;
  /** Cuántas entidades (equipos con alertas / cuentas) hay en total. */
  universe: number;
}
