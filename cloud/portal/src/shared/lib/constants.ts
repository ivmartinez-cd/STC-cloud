/**
 * "Modelo unificado de umbrales" (26/08/2026): estos dos valores ahora son
 * sólo el FALLBACK antes de que resuelva `useSystemSettings()`
 * (`shared/hooks/useSystemSettings.ts`) — la fuente real es
 * `system_settings` (`GET/PUT /api/v1/settings/system`), configurable desde
 * `Settings.tsx`. Se mantienen acá con el mismo valor que el default del
 * backend (`DEFAULT_SYSTEM_SETTINGS`) para que la pantalla no cambie de
 * opinión visualmente en el primer render.
 */
export const OFFLINE_THRESHOLD_MS   = 5 * 60 * 1000;   // 5 min sin heartbeat → agente offline
/**
 * Bug real (23/08/2026): estaba en 30 min, pero el agente reduce su propia
 * frecuencia fuera del horario laboral configurado (`agents.business_hours`,
 * default Mon-Fri 08-18) — los loops de meter/supplies pasan de 20/60 min a
 * **4 horas** fuera de esa ventana (`INTERVALS.meter.off`/`supplies.off` en
 * `agent/src/core/BusinessHours.ts`). Con 30 min de umbral, CUALQUIER equipo
 * de un agente real aparecía "SIN CONTACTO" la mayor parte de cada franja
 * fuera de horario, aunque estuviera reportando con total normalidad. Subido
 * a 5 horas (4h del peor caso + 1h de margen por red/reinicio del agente).
 */
export const DEVICE_OFFLINE_THRESHOLD_MS = 5 * 60 * 60 * 1000;
export const DASHBOARD_POLL_MS      = 60_000;           // intervalo de refresco del dashboard
export const REPORT_RECORD_LIMIT    = 5_000;            // máximo registros a traer en reportes
export const REPORT_DISPLAY_LIMIT   = 100;              // máximo filas visibles en tabla de reporte
export const SNMP_DEFAULT_COMMUNITY = 'public';         // comunidad SNMP por defecto
export const API_TIMEOUT_MS         = 15_000;           // timeout de requests HTTP
export const TOAST_DURATION_MS      = 5_000;            // duración auto-dismiss de toasts
export const TIME_TICK_MS           = 60_000;           // intervalo de actualización de timestamps relativos

/** Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular (punto #7 de la comparativa: Totalmente habilitado / Solo consumibles / Solo informes / Deshabilitado). */
export type MonitorState = 'full' | 'supplies_only' | 'reports_only' | 'disabled';
export const MONITOR_STATE_LABELS: Record<MonitorState, string> = {
  full: 'Totalmente habilitado',
  supplies_only: 'Sólo consumibles',
  reports_only: 'Sólo informes',
  disabled: 'Deshabilitado',
};
export const MONITOR_STATE_COLORS: Record<MonitorState, string> = {
  full: 'bg-emerald-100 text-emerald-700',
  supplies_only: 'bg-blue-100 text-blue-700',
  reports_only: 'bg-amber-100 text-amber-700',
  disabled: 'bg-slate-200 text-slate-600',
};

/** Fase 11 del gap analysis vs HP SDS — módulo de incidentes. */
export type IncidentStatus = 'open' | 'in_progress' | 'on_hold' | 'closed';
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierto',
  in_progress: 'En curso',
  on_hold: 'En espera',
  closed: 'Cerrado',
};
export const INCIDENT_STATUS_COLORS: Record<IncidentStatus, string> = {
  open: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-amber-100 text-amber-700',
  on_hold: 'bg-slate-200 text-slate-600',
  closed: 'bg-emerald-100 text-emerald-700',
};
