/**
 * Intervalos de los 4 loops de monitoreo (Alert/Identity·Discovery/Meter/
 * Consumables·Supplies), configurables por agente — mismo patrón que
 * `BusinessHours.ts`: un objeto opcional en `AgentConfig`, `undefined`/`null`
 * = usar `DEFAULT_MONITOR_INTERVALS` (los valores de siempre, EXACTOS de la
 * comparativa HP SDS — ver el comentario de `DEFAULT_MONITOR_INTERVALS`),
 * cero cambio de comportamiento para agentes sin configurar.
 *
 * Guardado en minutos (mismo formato que edita el portal); `resolveIntervals()`
 * es el único punto que los convierte a ms para el `TaskScheduler`.
 */

export interface IntervalPair {
  /** Minutos en horario laboral. */
  biz: number;
  /** Minutos fuera de horario laboral. */
  off: number;
}

export interface MonitorIntervalsConfig {
  alert: IntervalPair;
  discovery: IntervalPair;
  meter: IntervalPair;
  supplies: IntervalPair;
}

/** Valores de siempre — White Paper "Monitoring Loops" de HP SDS Manager:
 *  Alert 3/15, Identity 10/60, Meter 20/240, Consumables 60/240 (minutos). */
export const DEFAULT_MONITOR_INTERVALS: MonitorIntervalsConfig = {
  alert:     { biz: 3,  off: 15 },
  discovery: { biz: 10, off: 60 },
  meter:     { biz: 20, off: 240 },
  supplies:  { biz: 60, off: 240 },
};

interface ResolvedIntervalPair {
  biz: number;
  off: number;
}

export interface ResolvedIntervals {
  alert: ResolvedIntervalPair;
  discovery: ResolvedIntervalPair;
  meter: ResolvedIntervalPair;
  supplies: ResolvedIntervalPair;
}

const toMs = (pair: IntervalPair): ResolvedIntervalPair => ({ biz: pair.biz * 60_000, off: pair.off * 60_000 });

/** `config` ausente/null = `DEFAULT_MONITOR_INTERVALS` entero, en ms — lo que consume `TaskScheduler`. */
export function resolveIntervals(config?: MonitorIntervalsConfig | null): ResolvedIntervals {
  const src = config ?? DEFAULT_MONITOR_INTERVALS;
  return {
    alert: toMs(src.alert),
    discovery: toMs(src.discovery),
    meter: toMs(src.meter),
    supplies: toMs(src.supplies),
  };
}
