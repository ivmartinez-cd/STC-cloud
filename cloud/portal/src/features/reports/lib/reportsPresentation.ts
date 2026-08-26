import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { ClosureLine, PreviewLine } from '../types/reports';

/** Forma común de fila para la tabla — `PreviewLine` (en vivo) y `ClosureLine`
 * (persistida) tienen nombres de columna distintos (`first_total` vs
 * `first_total_pages`) pero la misma información; unificar acá evita
 * duplicar la tabla entera para cada caso. */
export interface ReportRow {
  key: string;
  deviceId: string | null;
  serial: string | null;
  model: string | null;
  firstTotal: number | null;
  firstAt: string | null;
  lastTotal: number | null;
  lastAt: string | null;
  deltaTotal: number;
  deltaMono: number;
  deltaColor: number;
  deltaEstimated: number | null;
  hadCounterReset: boolean;
  source: string | null;
}

// Postgres/Knex serializan `bigint` como STRING en el JSON de wire (evita
// pérdida de precisión sobre Number.MAX_SAFE_INTEGER) — `delta_total`/
// `delta_mono`/`delta_color`/`first_total`/`last_total` son todas `bigint`
// en el schema aunque el tipo TS de arriba diga `number`. Sin este cast acá,
// `rows.reduce((a,r) => a + r.deltaMono, 0)` hace CONCATENACIÓN de strings
// (`0 + "250"` → `"0250"`), no suma — bug real encontrado navegando la
// pantalla con Playwright (handoff hifi #3, verificación post-fase-5).
function num(v: number | string | null): number {
  return v == null ? 0 : Number(v);
}
function numOrNull(v: number | string | null): number | null {
  return v == null ? null : Number(v);
}

export function rowFromPreview(l: PreviewLine): ReportRow {
  return {
    key: l.device_id, deviceId: l.device_id, serial: l.serial_number, model: l.model,
    firstTotal: numOrNull(l.first_total), firstAt: l.first_reading_at, lastTotal: numOrNull(l.last_total), lastAt: l.last_reading_at,
    deltaTotal: num(l.delta_total), deltaMono: num(l.delta_mono), deltaColor: num(l.delta_color), deltaEstimated: numOrNull(l.delta_estimated),
    hadCounterReset: l.had_counter_reset, source: l.source,
  };
}

export function rowFromClosureLine(l: ClosureLine): ReportRow {
  return {
    key: l.id, deviceId: l.device_id, serial: l.device_serial, model: l.device_model,
    firstTotal: numOrNull(l.first_total_pages), firstAt: l.first_reading_at, lastTotal: numOrNull(l.last_total_pages), lastAt: l.last_reading_at,
    deltaTotal: num(l.delta_total), deltaMono: num(l.delta_mono), deltaColor: num(l.delta_color), deltaEstimated: numOrNull(l.delta_estimated),
    hadCounterReset: l.had_counter_reset, source: l.source,
  };
}

/** El valor que se muestra en la columna DELTA — la estimación cuando hay
 * reset y se pudo calcular (histórico previo suficiente), el delta crudo
 * si no. Nunca se pisa `deltaTotal` en el dato, sólo en la presentación. */
export function displayDelta(row: ReportRow): number {
  return row.hadCounterReset && row.deltaEstimated != null && row.deltaEstimated > 0 ? row.deltaEstimated : row.deltaTotal;
}

export function fmtInt(n: number): string {
  return n.toLocaleString('es-AR');
}

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Bug real encontrado verificando "Duplicar informe" (handoff hifi #3,
 * cierre de gaps, 26/08/2026): `''` (informe sin programar, `next_run_at`
 * null) daba `new Date('').toLocaleString()` → literalmente "Invalid Date"
 * en la tabla, no un string vacío — el `|| '—'` de los callers nunca
 * disparaba porque esa string es truthy. */
export function fmtClosedAt(v: string): string {
  if (!v) return '';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
