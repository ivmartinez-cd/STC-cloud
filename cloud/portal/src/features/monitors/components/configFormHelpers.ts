import type { EditFormData, MonitorData } from '../../../shared/types/monitor';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_MONITOR_INTERVALS, type MonitorIntervalsConfig } from '../../../shared/types/agents';

/** Los 4 loops de monitoreo del agente, en el orden de prioridad real del
 *  `TaskScheduler` (alert > meter > supplies > discovery) — no el de la tabla
 *  del White Paper de HP SDS, para que coincida con lo que el operador ve
 *  correr primero en los logs. */
export const INTERVAL_ROWS: { key: keyof MonitorIntervalsConfig; label: string }[] = [
  { key: 'alert', label: 'Alertas' },
  { key: 'meter', label: 'Contadores' },
  { key: 'supplies', label: 'Consumibles y bandejas' },
  { key: 'discovery', label: 'Identidad (descubrimiento)' },
];

/**
 * Formulario completo de `PUT /agents/:id/config` armado desde el monitor.
 * Lo comparten el tab Configuración (edita todo menos `ip_ranges`) y el tab
 * Segmentos (edita sólo `ip_ranges`): el endpoint recibe la config entera, así
 * que cada tab manda lo suyo y el resto tal cual está en el monitor.
 *
 * `MonitorData.config.ip_ranges` es siempre un array ya parseado — la columna
 * `agents.ip_ranges` es `jsonb`, node-pg la devuelve parseada siempre, y el
 * backend (`parseAgentIpRanges` en `portalAgentController/reads.ts`) nunca
 * manda un string crudo.
 */
export function formFromMonitor(monitor: MonitorData): EditFormData {
  return {
    name: monitor.name,
    ip_ranges: monitor.config?.ip_ranges ?? [],
    snmp: monitor.config?.snmp_community ?? 'public',
    tonerWarningThreshold: monitor.config?.toner_warning_threshold ?? 20,
    tonerCriticalThreshold: monitor.config?.toner_critical_threshold ?? 10,
    businessHours: monitor.config?.business_hours ?? DEFAULT_BUSINESS_HOURS,
    monitorIntervals: monitor.config?.monitor_intervals ?? DEFAULT_MONITOR_INTERVALS,
  };
}

/** Primer problema de forma del tab Configuración (los segmentos IP se
 *  validan en su propio tab, ver `firstRangeProblem`), o `null` si está bien.
 *  Devuelve `[mensaje, severidad]` para el toast. */
export function configFormProblem(form: EditFormData): [string, 'error' | 'warning'] | null {
  if (form.tonerCriticalThreshold >= form.tonerWarningThreshold) {
    return ['El umbral crítico debe ser menor que el umbral de advertencia', 'error'];
  }
  if (form.businessHours.days.length === 0) return ['El horario laboral requiere al menos un día', 'warning'];
  if (form.businessHours.start_hour >= form.businessHours.end_hour) {
    return ['La hora de inicio del horario laboral debe ser menor que la de fin', 'warning'];
  }
  for (const { key, label } of INTERVAL_ROWS) {
    const { biz, off } = form.monitorIntervals[key];
    if (!Number.isInteger(biz) || biz < 1 || !Number.isInteger(off) || off < 1) {
      return [`Frecuencia de monitoreo — "${label}": los minutos deben ser enteros de al menos 1`, 'warning'];
    }
    if (off < biz) {
      return [`Frecuencia de monitoreo — "${label}": fuera de horario no puede ser más rápido que en horario laboral`, 'warning'];
    }
  }
  return null;
}
