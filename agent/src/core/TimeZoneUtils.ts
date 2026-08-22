// === TimeZone Utils ===
// TZ configurada en tiempo de ejecución, compartida por `Logger.ts` y
// `LogTailer.ts`. Módulo separado (no vive en `Logger.ts`) porque
// `LogTailer` es importado POR `Logger.ts` — un import en sentido contrario
// crearía un ciclo.
//
// `log()` se llama desde ~100 lugares del agente sin inyección de
// dependencias — threadear la config por cada call-site sería
// desproporcionado para un timestamp de log. Se usa un mutable a nivel de
// módulo, seteado UNA vez al arrancar (`main.ts`, tras `ConfigManager.load()`)
// y de nuevo cada vez que el heartbeat trae una TZ nueva
// (`HeartbeatService.handleRemoteConfig()`).

import { DEFAULT_BUSINESS_HOURS } from './BusinessHours';

let configuredTimezone: string = DEFAULT_BUSINESS_HOURS.timezone;

export function getConfiguredTimezone(): string {
  return configuredTimezone;
}

/** `tz` vacío/null/undefined vuelve al default hardcodeado. */
export function setConfiguredTimezone(tz: string | null | undefined): void {
  configuredTimezone = tz && tz.trim() ? tz.trim() : DEFAULT_BUSINESS_HOURS.timezone;
}

/**
 * Offset UTC ("+HH:MM"/"-HH:MM") de `tz` en el instante `date` — correcto
 * para cualquier TZ IANA incluyendo DST, sin librería nueva (mismo mecanismo
 * que el módulo equivalente del lado cloud, `services/businessHours.ts` —
 * duplicado porque no hay paquete compartido entre `agent/` y `cloud/`).
 */
export function getUtcOffsetString(tz: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(date);
  const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = /^GMT([+-]\d{2}:\d{2})$/.exec(raw);
  return m ? m[1] : '+00:00';
}
