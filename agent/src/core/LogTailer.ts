import fs from 'fs';

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
    
    // Si el archivo se achicó (rotación), reseteamos
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
      // Formato esperado: [12/05/2026, 09:40:46] [INFO] Mensaje
      const match = line.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
      if (match) {
        return {
          timestamp: match[1],
          level: match[2],
          message: match[3]
        };
      }
      return {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: line
      };
    });

    // Enterprise Policy: Solo subir WARN y ERROR automáticamente para reducir ruido.
    // Los INFO se quedan en el archivo local del agente.
    return parsedLogs.filter(log => ['WARN', 'ERROR'].includes(log.level));
  }
}
