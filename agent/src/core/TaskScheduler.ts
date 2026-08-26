import { log } from './Logger';
import { isBusinessHours, INTERVALS } from './BusinessHours';
import type { ScanService } from './ScanService';
import type { AgentConfig } from './config';

interface TaskSchedulerDeps {
  scanService: ScanService;
  getConfig: () => AgentConfig;
}

export class TaskScheduler {
  private deps: TaskSchedulerDeps;
  private isNetworkTaskRunning = false;
  private lastDiscoveryTime = 0;
  private lastMeterTime = Date.now();
  private lastSuppliesTime = Date.now();
  // Fase 11 del gap analysis vs HP SDS — loop dedicado de alertas (3/15 min,
  // separado de consumibles). Arranca como meter/supplies (no como discovery):
  // no hace falta una corrida inmediata al boot, el primer barrido de
  // discovery ya trae alertas (`DISCOVERY_SCOPES` las incluye).
  private lastAlertTime = Date.now();
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: TaskSchedulerDeps) {
    this.deps = deps;
  }

  get isBusy(): boolean {
    return this.isNetworkTaskRunning;
  }

  start(delayMs = 0): void {
    if (delayMs > 0) {
      this.timer = setTimeout(() => this.run(), delayMs);
    } else {
      this.run();
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Corre como mucho UNA tarea de red por tick (`isNetworkTaskRunning` las serializa) —
   *  factorizado para no repetir el try/set-lastTime/finally cuatro veces. */
  private async runTask(task: () => Promise<void>, onDone: () => void): Promise<void> {
    this.isNetworkTaskRunning = true;
    try {
      await task();
      onDone();
    } finally {
      this.isNetworkTaskRunning = false;
    }
  }

  private async run(): Promise<void> {
    if (this.isNetworkTaskRunning) {
      this.timer = setTimeout(() => this.run(), 10_000); // Check again in 10s if busy
      return;
    }

    const now = Date.now();
    const biz = isBusinessHours(this.deps.getConfig().businessHours);

    const alertInterval     = biz ? INTERVALS.alert.biz : INTERVALS.alert.off;
    const discoveryInterval = biz ? INTERVALS.discovery.biz : INTERVALS.discovery.off;
    const meterInterval     = biz ? INTERVALS.meter.biz : INTERVALS.meter.off;
    const suppliesInterval  = biz ? INTERVALS.supplies.biz : INTERVALS.supplies.off;

    // Alertas primero: es el loop más frecuente (3/15) — si compitiera en último
    // lugar contra discovery/meter/supplies, un tick donde varios vencen a la vez
    // lo postergaría de forma repetida. Discovery/meter/supplies corren cada
    // varios minutos: perder un tick de 5s contra ellos no importa.
    if (now - this.lastAlertTime >= alertInterval) {
      await this.runTask(() => this.deps.scanService.runAlertTask(), () => { this.lastAlertTime = Date.now(); });
    }
    else if (now - this.lastDiscoveryTime >= discoveryInterval) {
      await this.runTask(() => this.deps.scanService.scan(), () => { this.lastDiscoveryTime = Date.now(); });
    }
    else if (now - this.lastMeterTime >= meterInterval) {
      await this.runTask(() => this.deps.scanService.runMeterTask(), () => { this.lastMeterTime = Date.now(); });
    }
    else if (now - this.lastSuppliesTime >= suppliesInterval) {
      await this.runTask(() => this.deps.scanService.runSuppliesTask(), () => { this.lastSuppliesTime = Date.now(); });
    }

    // Loop every 5 seconds
    this.timer = setTimeout(() => this.run(), 5_000);
  }
}
