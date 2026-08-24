import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

/**
 * Registro Prometheus del backend (Fase 5.1 de producción-readiness).
 * Métricas propias con prefijo `stc_`; las default de proceso (heap, event
 * loop, GC) van sin prefijo estándar de prom-client.
 */
export const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: "stc_http_request_duration_seconds",
  help: "Duración de requests HTTP por ruta declarada",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const jobTicksTotal = new Counter({
  name: "stc_job_ticks_total",
  help: "Ticks de jobs por resultado (ok/error/skipped — skipped = lock tomado por otra réplica)",
  labelNames: ["job", "result"],
  registers: [register],
});

const jobTickDuration = new Histogram({
  name: "stc_job_tick_duration_seconds",
  help: "Duración de cada tick de job",
  labelNames: ["job"],
  buckets: [0.05, 0.25, 1, 5, 15, 60, 180],
  registers: [register],
});

const jobLastSuccess = new Gauge({
  name: "stc_job_last_success_timestamp_seconds",
  help: "Epoch del último tick exitoso por job (para alertar jobs muertos)",
  labelNames: ["job"],
  registers: [register],
});

/** Punto único que usa `observability/guarded-tick.ts`. */
export function observeJobTick(job: string, result: "ok" | "error" | "skipped", durationMs: number): void {
  jobTicksTotal.inc({ job, result });
  if (result !== "skipped") jobTickDuration.observe({ job }, durationMs / 1000);
  if (result === "ok") jobLastSuccess.set({ job }, Date.now() / 1000);
}

/**
 * Conexiones WS vivas. `ws/index.ts` registra el provider al cargar —
 * inyección por callback para no crear un import api→modules→ws circular.
 */
let wsCountsProvider: (() => { agents: number; portals: number }) | null = null;

export function setWsCountsProvider(fn: () => { agents: number; portals: number }): void {
  wsCountsProvider = fn;
}

new Gauge({
  name: "stc_ws_connections",
  help: "Conexiones WebSocket vivas por tipo",
  labelNames: ["kind"],
  registers: [register],
  collect() {
    const counts = wsCountsProvider?.();
    if (!counts) return;
    this.set({ kind: "agent" }, counts.agents);
    this.set({ kind: "portal" }, counts.portals);
  },
});

/** Profundidad de colas BullMQ — provider inyectado por server.ts al boot. */
let queueDepthProvider: (() => Promise<Record<string, number>>) | null = null;

export function setQueueDepthProvider(fn: () => Promise<Record<string, number>>): void {
  queueDepthProvider = fn;
}

new Gauge({
  name: "stc_queue_waiting_jobs",
  help: "Jobs en espera por cola BullMQ",
  labelNames: ["queue"],
  registers: [register],
  async collect() {
    if (!queueDepthProvider) return;
    try {
      const depths = await queueDepthProvider();
      for (const [queue, waiting] of Object.entries(depths)) {
        this.set({ queue }, waiting);
      }
    } catch {
      // un Redis caído no debe romper el scrape completo
    }
  },
});
