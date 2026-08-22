import fs from 'fs';
import { getConfiguredTimezone, getUtcOffsetString } from './TimeZoneUtils';

export class LogTailer {
  private lastPosition: number = 0;
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    if (fs.existsSync(this.logFile)) {
      this.lastPosition = fs.statSync(this.logFile).size;
    }
  }

  async getNewLogs(): Promise<{ level: string; message: string; timestamp: string }[]> {
    if (!fs.existsSync(this.logFile)) return [];

    const stats = fs.statSync(this.logFile);
    
    // Si el archivo se achico (rotacion), reseteamos
    if (stats.size < this.lastPosition) {
      this.lastPosition = 0;
    }

    if (stats.size === this.lastPosition) return [];

    const buffer = Buffer.alloc(stats.size - this.lastPosition);
    const fd = fs.openSync(this.logFile, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
    fs.closeSync(fd);

    this.lastPosition = stats.size;

    const content = buffer.toString('utf8');
    const lines = content.split('\n').filter(l => l.trim() !== '');

    const parsedLogs = lines.map(line => {
      // Regex ultra-flexible: Fecha, Hora, Nivel (sin corchetes), Mensaje
      const match = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\w+)\s+(.+)$/);
      
      if (match) {
        const [_, date, time, level, message] = match;
        const [day, month, year] = date.split('/');
        // Offset real de la TZ configurada (no fijo a Argentina) — Logger.ts
        // escribe estas líneas usando esa misma TZ, así que acá hay que
        // etiquetarlas con el offset que corresponde, no uno hardcodeado.
        const isoTimestamp = `${year}-${month}-${day}T${time}${getUtcOffsetString(getConfiguredTimezone(), new Date())}`;
        
        return {
          timestamp: isoTimestamp,
          level: level.trim(),
          message: message
        };
      }
      return {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: line
      };
    });

    return parsedLogs;
  }
}
