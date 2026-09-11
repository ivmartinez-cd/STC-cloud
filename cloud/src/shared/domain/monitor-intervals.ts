/**
 * Intervalos de los 4 loops de monitoreo del agente (Alert/Identity·Discovery/
 * Meter/Consumables·Supplies), personalizables por agente — mismo patrón que
 * `business-hours.ts`: lógica pura, sin Knex, sin Fastify.
 *
 * Se guarda en `agents.monitor_intervals` (jsonb nullable, migración
 * `20260911130000_agent_monitor_intervals`). `null` en la columna significa
 * "usa el default hardcodeado" (`DEFAULT_MONITOR_INTERVALS`, los valores
 * EXACTOS del White Paper "Monitoring Loops" de HP SDS Manager: Alert 3/15,
 * Identity 10/60, Meter 20/240, Consumables 60/240 minutos) — cero cambio de
 * comportamiento para agentes sin configurar.
 */

export interface IntervalPair {
  /** Minutos en horario laboral. Entero positivo. */
  biz: number;
  /** Minutos fuera de horario laboral. Entero positivo, debe ser >= `biz`. */
  off: number;
}

export interface MonitorIntervalsConfig {
  alert: IntervalPair;
  discovery: IntervalPair;
  meter: IntervalPair;
  supplies: IntervalPair;
}

export const DEFAULT_MONITOR_INTERVALS: MonitorIntervalsConfig = {
  alert:     { biz: 3,  off: 15 },
  discovery: { biz: 10, off: 60 },
  meter:     { biz: 20, off: 240 },
  supplies:  { biz: 60, off: 240 },
};

const LOOP_KEYS = ["alert", "discovery", "meter", "supplies"] as const;
type LoopKey = (typeof LOOP_KEYS)[number];

/** Tope generoso (24h) — no hay motivo de negocio para un loop más lento que
 *  eso, y evita que un typo (ej. 24000 en vez de 240) quede guardado sin aviso. */
const MAX_MINUTES = 1440;

export class MonitorIntervalsValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

function validatePair(raw: unknown, loop: LoopKey): IntervalPair {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MonitorIntervalsValidationError(`monitor_intervals.${loop} debe ser un objeto {biz, off}`, `monitor_intervals.${loop}`);
  }
  const o = raw as Record<string, unknown>;
  const { biz, off } = o;
  if (typeof biz !== "number" || !Number.isInteger(biz) || biz < 1 || biz > MAX_MINUTES) {
    throw new MonitorIntervalsValidationError(`monitor_intervals.${loop}.biz debe ser un entero entre 1 y ${MAX_MINUTES} (minutos)`, `monitor_intervals.${loop}.biz`);
  }
  if (typeof off !== "number" || !Number.isInteger(off) || off < 1 || off > MAX_MINUTES) {
    throw new MonitorIntervalsValidationError(`monitor_intervals.${loop}.off debe ser un entero entre 1 y ${MAX_MINUTES} (minutos)`, `monitor_intervals.${loop}.off`);
  }
  // Fuera de horario laboral el loop tiene que ser IGUAL o MÁS LENTO, nunca
  // más rápido — lo contrario invertiría el propósito del horario laboral
  // (reducir tráfico fuera de la ventana operativa).
  if (off < biz) {
    throw new MonitorIntervalsValidationError(`monitor_intervals.${loop}.off no puede ser menor que .biz (fuera de horario debe ser igual o más lento)`, `monitor_intervals.${loop}.off`);
  }
  return { biz, off };
}

/**
 * Valida el body de `monitor_intervals` (PUT config). `raw === null` es un
 * reset explícito al default (distinto de `undefined`, que en el caller
 * significa "no tocar este campo"). Los 4 loops son obligatorios cuando se
 * manda el objeto — no hay merge parcial contra el default acá (eso llevaría
 * a un estado ambiguo entre "no configurado" y "configurado a medias");
 * el portal siempre manda el objeto completo.
 */
export function validateMonitorIntervals(raw: unknown): MonitorIntervalsConfig | null {
  if (raw === null) return null;
  if (raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MonitorIntervalsValidationError("monitor_intervals debe ser un objeto o null", "monitor_intervals");
  }
  const o = raw as Record<string, unknown>;
  const result = {} as MonitorIntervalsConfig;
  for (const loop of LOOP_KEYS) {
    result[loop] = validatePair(o[loop], loop);
  }
  return result;
}
