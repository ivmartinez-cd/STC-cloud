import { log } from './Logger';
import { ConsoleConnector } from './ConsoleConnector';
import type { SocketManager } from './SocketManager';

export interface CommandResult {
  status: 'success' | 'error';
  type: string;
  result: Record<string, unknown> | { error: string };
  id?: string;
}

export type ScanTrigger = () => void;
export type ForceUpdateFn = () => Promise<boolean>;

export class CommandHandler {
  private commandResults: CommandResult[] = [];
  private processedCommandIds = new Set<string>();
  private socket: SocketManager | null = null;
  private scanTrigger: ScanTrigger | null = null;
  private forceUpdateFn: ForceUpdateFn | null = null;
  private isNetworkBusy: () => boolean = () => false;

  setSocket(socket: SocketManager | null): void {
    this.socket = socket;
  }

  setScanTrigger(fn: ScanTrigger): void {
    this.scanTrigger = fn;
  }

  setForceUpdateFn(fn: ForceUpdateFn): void {
    this.forceUpdateFn = fn;
  }

  setNetworkBusyCheck(fn: () => boolean): void {
    this.isNetworkBusy = fn;
  }

  isProcessed(id: string): boolean {
    return this.processedCommandIds.has(id);
  }

  markProcessed(id: string): void {
    this.processedCommandIds.add(id);
    if (this.processedCommandIds.size > 1000) {
      const firstKey = this.processedCommandIds.values().next().value;
      if (firstKey) this.processedCommandIds.delete(firstKey);
    }
  }

  getResults(): CommandResult[] {
    return this.commandResults;
  }

  clearResults(): void {
    this.commandResults = [];
  }

  async handleCommand(type: string, payload: unknown = {}, id?: string): Promise<CommandResult> {
    log('INFO', `Ejecutando comando remoto: ${type} (ID: ${id || 'N/A'})`);
    try {
      let result = {};
      switch (type) {
        case 'RESCAN':
        case 'FORCE_SCAN':
          if (!this.isNetworkBusy()) {
            this.scanTrigger?.();
            result = { message: 'Scan iniciado correctamente' };
          } else {
            log('INFO', `Comando ${type} ignorado: tarea de red en progreso.`);
            result = { message: 'Scan pospuesto: hay una tarea de red en curso' };
          }
          break;
        case 'RESTART':
          log('WARN', 'Reinicio remoto solicitado. Saliendo en 2 segundos...');
          setTimeout(() => process.exit(0), 2000);
          result = { message: 'Reiniciando agente...' };
          break;
        case 'STC_CONSOLE': {
          const connector = new ConsoleConnector();
          const commandText = typeof payload === 'object' && payload !== null && 'command' in payload
            ? String((payload as { command?: unknown }).command ?? '')
            : '';
          const output = await connector.execute(commandText);
          result = { output };
          break;
        }
        case 'FORCE_UPDATE': {
          const applied = this.forceUpdateFn ? await this.forceUpdateFn() : false;
          result = { message: applied ? 'Actualizacion aplicada. Reiniciando...' : 'Sin actualizacion disponible o verificacion fallida.' };
          break;
        }
        default:
          throw new Error(`Comando no soportado: ${type}`);
      }

      const finalResult: CommandResult = { status: 'success', type, result, id };

      // Notificar via WS para feedback instantaneo si es posible
      if (this.socket && this.socket.isConnected()) {
        this.socket.send('command_result', finalResult);
      }

      return finalResult;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Error ejecutando comando ${type}: ${errMsg}`);
      const finalError: CommandResult = { status: 'error', type, result: { error: errMsg }, id };

      if (this.socket && this.socket.isConnected()) {
        this.socket.send('command_result', finalError);
      }

      return finalError;
    }
  }
}
