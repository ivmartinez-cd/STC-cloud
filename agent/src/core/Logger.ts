import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config';
import { LogTailer } from './LogTailer';
import { getConfiguredTimezone } from './TimeZoneUtils';

const LOG_MAX_BYTES = 10 * 1024 * 1024;
export const LOG_PATH = path.join(DATA_DIR, 'agent.log');
export const logTailer = new LogTailer(LOG_PATH);

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogFn = (level: LogLevel, msg: string) => void;

export function log(level: LogLevel, msg: string): void {
  const now = new Date();
  const tz = getConfiguredTimezone();
  const date = now.toLocaleDateString('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const timestamp = `${date} ${time}`;

  const levelPadded = level.padEnd(8);
  const line = `${timestamp}     ${levelPadded} ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, LOG_PATH + '.1');
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
