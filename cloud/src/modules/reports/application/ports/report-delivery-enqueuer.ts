/**
 * Encola `report.closed` para `jobs/reportDeliveryWorker.ts`. Best-effort por
 * contrato: una entrega perdida no debe tumbar el cierre en sí (ya
 * commiteado) — el adapter absorbe y loguea el error, nunca lo propaga. Debe
 * llamarse DESPUÉS de que la transacción del cierre commitee: si se encolara
 * adentro, el worker podría consultar `report_closures` antes de que el
 * commit sea visible.
 */
export interface ReportDeliveryEnqueuer {
  enqueueReportClosed(closureId: string): Promise<void>;
}
