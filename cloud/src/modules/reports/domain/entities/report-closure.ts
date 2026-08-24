/**
 * Cierre mensual inmutable por cliente (`report_closures`) + sus líneas por
 * dispositivo (`report_closure_lines`). La inmutabilidad real está en que no
 * existe ningún caso de uso que actualice montos: reabrir sólo cambia
 * estado/auditoría y libera el período para un cierre NUEVO, que linkea
 * `supersededBy` en el viejo.
 */

export type ClosureStatus = "closed" | "reopened";

export interface ClosureTotals {
  totalPages: number;
  totalMono: number;
  totalColor: number;
}

export interface ReportClosure extends ClosureTotals {
  id: string;
  clientId: string;
  /** Primer día del mes (columna `date`). */
  period: Date;
  status: ClosureStatus | string;
  closedAt: Date;
  closedBy: string | null;
  reopenedAt: Date | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  supersededBy: string | null;
}

export interface ReportClosureLine {
  id: string;
  closureId: string;
  deviceId: string | null;
  deviceSerial: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  agentId: string | null;
  agentName: string | null;
  firstReadingAt: Date | null;
  firstTotalPages: number | null;
  firstMonoPages: number | null;
  firstColorPages: number | null;
  lastReadingAt: Date | null;
  lastTotalPages: number | null;
  lastMonoPages: number | null;
  lastColorPages: number | null;
  deltaTotal: number;
  deltaMono: number;
  deltaColor: number;
  /** `devices.poll_method` congelado al cerrar. */
  source: string | null;
  hadCounterReset: boolean;
}
