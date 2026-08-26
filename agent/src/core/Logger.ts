import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config';
import { LogTailer } from './LogTailer';
import { getConfiguredTimezone } from './TimeZoneUtils';

/**
 * Locale del timestamp de cada línea (pasada de polish de locale,
 * 26/08/2026) — antes `'es-AR'` fijo. Verificado con Node real (no
 * asumido): para el mismo formato numérico DD/MM/YYYY, `es-CL` usa "-"
 * como separador en vez de "/" (`es-AR`/`es-MX` sí coinciden en "/") — no
 * era un cambio inerte como parecía a primera vista. Toma el locale
 * resuelto por el propio Node (ICU, heredado del SO del equipo donde
 * corre el agente) y sólo lo usa si es alguna variante de español —
 * mismo criterio que `APP_LOCALE` del portal (`shared/lib/formatters.ts`):
 * este archivo es un log de texto plano para soporte, no vale la pena
 * arriesgar mezclar idiomas si el Node embebido resolviera a otra cosa.
 */
const LOG_LOCALE = (() => {
  const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
  return resolved?.toLowerCase().startsWith('es') ? resolved : 'es-AR';
})();

const LOG_MAX_BYTES = 10 * 1024 * 1024;
// Antes: un solo nivel de rotación (`.1` se pisaba en cada corte, sin
// retención real más allá del archivo activo + uno). Ahora rota en cadena
// hasta LOG_MAX_FILES, borrando el más viejo — mismo criterio que logrotate.
const LOG_MAX_FILES = 5;
// Re-chequea `AGENT_DATA_DIR` en cada llamada (no una constante fijada al
// importar el módulo) — mismo criterio ya usado en `sync/database.ts:16`
// para que los tests puedan apuntar a un directorio temporal seteando la
// env var ANTES de que se llame `log()`, incluso si el import de este
// módulo (con su resolución ESM) ya se evaluó antes de esa asignación.
function currentLogPath(): string {
  return path.join(process.env.AGENT_DATA_DIR ?? DATA_DIR, 'agent.log');
}
export const LOG_PATH = currentLogPath();
export const logTailer = new LogTailer(LOG_PATH);

function rotateLogFiles(logPath: string): void {
  const oldest = `${logPath}.${LOG_MAX_FILES}`;
  if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
    const src = `${logPath}.${i}`;
    if (fs.existsSync(src)) fs.renameSync(src, `${logPath}.${i + 1}`);
  }
  fs.renameSync(logPath, `${logPath}.1`);
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogFn = (level: LogLevel, msg: string) => void;

export function log(level: LogLevel, msg: string): void {
  const now = new Date();
  const tz = getConfiguredTimezone();
  const date = now.toLocaleDateString(LOG_LOCALE, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString(LOG_LOCALE, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const timestamp = `${date} ${time}`;

  const levelPadded = level.padEnd(8);
  const line = `${timestamp}     ${levelPadded} ${msg}`;
  console.log(line);
  try {
    const logPath = currentLogPath();
    fs.appendFileSync(logPath, line + '\n');
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > LOG_MAX_BYTES) {
      rotateLogFiles(logPath);
    }
  } catch { /* log no critico */ }
}

export function setupProcessErrorHandlers(): void {
  // Captura de errores fatales antes de que el proceso muera
  process.on('uncaughtException', (err) => {
    log('ERROR', `EXCEPCION NO CAPTURADA: ${err.message}\n${err.stack}`);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log('ERROR', `RECHAZO DE PROMESA NO CAPTURADO: ${reason}`);
  });
}
