/**
 * Forma unificada de una alerta tal como la devuelve `GET /api/v1/alerts`
 * (`dashboardController.getAlerts`). Reemplaza 3 tipos `Alert` que habían quedado
 * divergentes en `Dashboard.tsx`/`DeviceDetail.tsx` — uno de ellos (`DeviceDetail`)
 * leía campos (`timestamp`, `deviceId`) que la API nunca manda (`created_at`,
 * `device_id`), así que esa columna nunca renderizaba nada.
 */
export type AlertSeverity = 'warning' | 'critical';

export type Alert = {
  /** `alerts.id` es un `serial` (entero), no un uuid — a diferencia de casi todo el resto del modelo. */
  id: number;
  device_id: string | null;
  agent_id: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
  resolved: boolean;
  resolved_at: string | null;
  acknowledged: boolean;
  ack_at: string | null;
  created_at: string;
  /** Ausentes en una alerta agent-scoped (p.ej. `agent_offline`, sin dispositivo puntual). */
  brand?: string | null;
  ip_address?: string | null;
  device_name?: string | null;
  serial?: string | null;
  agent_name?: string | null;
  client_name?: string | null;
};
