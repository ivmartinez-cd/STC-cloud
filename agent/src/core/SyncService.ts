import { log } from './Logger';
import { uploadPending } from '../sync/uploader';
import { purgeOld } from '../sync/database';
import type { AgentConfig } from './config';

interface SyncServiceDeps {
  getConfig: () => AgentConfig;
  setConfig: (c: AgentConfig) => void;
}

export class SyncService {
  private deps: SyncServiceDeps;
  private _isSyncing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: SyncServiceDeps) {
    this.deps = deps;
  }

  start(): void {
    this.syncLoop(true);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async syncOnce(): Promise<void> {
    await this.syncLoop(false);
  }

  private async syncLoop(loop: boolean): Promise<void> {
    if (this._isSyncing) return;
    this._isSyncing = true;

    try {
      purgeOld();
      const config = this.deps.getConfig();
      const { uploaded, failed, updatedConfig } = await uploadPending(config);
      if (updatedConfig) {
        log('INFO', 'Token actualizado detectado durante Sync. Actualizando memoria.');
        this.deps.setConfig(updatedConfig);
      }
      if (uploaded > 0) log('INFO', `Sync: ${uploaded} lecturas subidas`);
      if (failed > 0)   log('WARN', `Sync: ${failed} lecturas retenidas offline`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('WARN', `Sync error: ${errMsg}`);
    } finally {
      this._isSyncing = false;
      if (loop) {
        // Re-programar siguiente sincronizacion
        this.timer = setTimeout(() => this.syncLoop(true), 5 * 60_000);
      }
    }
  }
}
