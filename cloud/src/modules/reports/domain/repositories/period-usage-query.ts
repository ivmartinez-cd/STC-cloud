import type { PeriodUsageLine } from "../entities/period-usage-line";

/**
 * Consulta de volumen del período por dispositivo — la única "consulta de
 * verdad" del módulo (generaliza la subconsulta LAG-based delta-sum de "un
 * agente, mes en curso" a "un cliente, período arbitrario"). No escribe nada:
 * la usan tanto el preview como el cierre (que persiste lo mismo que ya vio
 * el preview).
 */
export interface PeriodUsageQuery {
  compute(clientId: string, period: string): Promise<PeriodUsageLine[]>;
}
