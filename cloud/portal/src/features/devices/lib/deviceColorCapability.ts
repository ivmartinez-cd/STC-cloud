import type { DetailedCounters, Device } from '../../../shared/types/monitor';
import type { SupplyRow } from '../../../shared/lib/supplies';

const COLOR_SUPPLIES: ReadonlySet<SupplyRow['color']> = new Set(['Cian', 'Magenta', 'Amarillo']);

function countersShowColor(c: DetailedCounters | undefined): boolean {
  if (!c) return false;
  const values = [
    c.colorSimplex?.total, c.colorDuplex?.total, c.colorEngineCycles,
    c.print?.color, c.copy?.color, c.fax?.color, c.equivalentA4?.color, c.duplexEquivalent?.color,
  ];
  return values.some(v => (v ?? 0) > 0);
}

/** ¿El equipo imprime en color? Manda el catálogo de modelos si lo tiene
 * cargado; si no, se infiere de lo que el equipo reporta: un consumible
 * C/M/Y o cualquier contador de color > 0. Sin ninguna señal → mono, que es
 * lo que corresponde ocultar (un equipo color siempre trae tóner C/M/Y). */
export function isColorDevice(device: Device, supplyRows: SupplyRow[], counters: DetailedCounters | undefined): boolean {
  if (device.model_is_color != null) return device.model_is_color;
  if (supplyRows.some(r => COLOR_SUPPLIES.has(r.color))) return true;
  return (device.color_pages ?? 0) > 0 || countersShowColor(counters);
}
