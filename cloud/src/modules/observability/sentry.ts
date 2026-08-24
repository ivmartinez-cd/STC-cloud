import * as Sentry from "@sentry/node";
import { logger } from "../../logger";

/**
 * Sentry opt-in (Fase 5.2 de producción-readiness, riesgo R4 del gap
 * analysis): se activa solo si `SENTRY_DSN` está definido — sin DSN, todo
 * es no-op y el entorno de desarrollo no cambia en nada.
 */
let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || enabled) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // Solo errores: sin tracing de performance (Prometheus ya cubre latencias).
    tracesSampleRate: 0,
  });
  enabled = true;
  logger.info("[Sentry] inicializado");
}

/** Captura best-effort: jamás lanza, y sin DSN es un no-op. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // la telemetría nunca debe romper el flujo que la llama
  }
}
