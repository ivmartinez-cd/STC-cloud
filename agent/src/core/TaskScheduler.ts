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
  /** ARRANQUE de la última vuelta de discovery (no fin, y no "último chunk"):
   *  sólo lo actualiza el chunk que abre una vuelta. Ver `run()`. */
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
      this.schedule(delayMs);
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

  /** Cancela el timer anterior antes de programar el próximo: sin esto, dos
   *  entradas al loop (un `start()` repetido) dejarían DOS cadenas de ticks
   *  corriendo para siempre, duplicando el tráfico de red del agente. */
  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), delayMs);
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
      this.schedule(10_000); // Check again in 10s if busy
      return;
    }

    const now = Date.now();
    const biz = isBusinessHours(this.deps.getConfig().businessHours);

    const alertInterval     = biz ? INTERVALS.alert.biz : INTERVALS.alert.off;
    const discoveryInterval = biz ? INTERVALS.discovery.biz : INTERVALS.discovery.off;
    const meterInterval     = biz ? INTERVALS.meter.biz : INTERVALS.meter.off;
    const suppliesInterval  = biz ? INTERVALS.supplies.biz : INTERVALS.supplies.off;

    // Orden de prioridad: alert > meter > supplies > discovery.
    //
    // Alertas primero: es el loop más frecuente (3/15) — si compitiera último,
    // un tick donde varios vencen a la vez lo postergaría de forma repetida.
    //
    // Discovery pasa a ser el RELLENO de menor prioridad desde el barrido
    // continuo: con una vuelta abierta está elegible en casi todos los ticks,
    // así que si compitiera arriba hambrearía a meter/supplies. Abajo de todo
    // casi no le cuesta nada: un chunk de IPs de rango dura lo que dura su
    // presupuesto (CHUNK_BUDGET_MS) — la excepción es el chunk que ABRE una
    // vuelta, que antes resuelve los hosts puntuales en secuencia, acotado por
    // PINNED_BUDGET_MS.
    if (now - this.lastAlertTime >= alertInterval) {
      await this.runTask(() => this.deps.scanService.runAlertTask(), () => { this.lastAlertTime = Date.now(); });
    }
    else if (now - this.lastMeterTime >= meterInterval) {
      await this.runTask(() => this.deps.scanService.runMeterTask(), () => { this.lastMeterTime = Date.now(); });
    }
    else if (now - this.lastSuppliesTime >= suppliesInterval) {
      await this.runTask(() => this.deps.scanService.runSuppliesTask(), () => { this.lastSuppliesTime = Date.now(); });
    }
    else {
      // El intervalo de discovery (10 min laboral / 60 fuera) gatea el ARRANQUE
      // DE UNA VUELTA NUEVA, no cada chunk: con una vuelta abierta siempre hay
      // chunk elegible, así el barrido avanza hasta cerrarla.
      //
      // Por eso el reloj se actualiza SÓLO cuando el chunk abre la vuelta: mide
      // desde el arranque, no desde el último chunk. Es la regla que HP SDS
      // documenta en "Monitoring Loops": "If it takes longer than the configured
      // time for a monitoring loop to get through the list of all devices being
      // monitored then the next run of that loop commences immediately" — una
      // vuelta que tardó más que el intervalo encadena la siguiente enseguida,
      // en vez de quedarse otros 10/60 min de brazos cruzados.
      //
      // Una sola lectura de `scan_state` por tick (es un SELECT a SQLite).
      const lapOpen = this.deps.scanService.isLapInProgress();
      if (lapOpen || now - this.lastDiscoveryTime >= discoveryInterval) {
        await this.runTask(
          () => this.deps.scanService.scan(),
          () => { if (!lapOpen) this.lastDiscoveryTime = Date.now(); },
        );
      }
    }

    // Loop every 5 seconds
    this.schedule(5_000);
  }
}
