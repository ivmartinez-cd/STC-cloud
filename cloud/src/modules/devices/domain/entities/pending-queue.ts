/**
 * Read models de la cola CROSS-CLIENTE de "Dispositivos pendientes" (handoff
 * hifi "Dispositivos pendientes", 25/08/2026) — a diferencia de `PendingDeviceRow`
 * (`./device.ts`), que es la cola SCOPEADA a un cliente (Fase 7 del gap analysis,
 * `/clients/:id/pending-devices`, sigue viva sin cambios para la tarjeta de
 * Cliente — Detalle), esta es la vista global admin/operator de TODOS los
 * clientes a la vez (`GET /devices/pending/directory`).
 */

/** `sin_cliente` gana sobre `duplicado` si ambas condiciones se dan (ver SQL en
 * `pending-queue-queries.ts`) — sin cliente sugerido no hay "inventario del
 * cliente destino" contra el cual comparar el serial. */
export type PendingQueueRevision = "nuevo" | "duplicado" | "sin_cliente";
export type PendingQueueSegment = "todos" | "posibles_duplicados" | "mas_7_dias" | "sin_cliente";
export type SortDir = "asc" | "desc";

export interface PendingQueueRow {
  id: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  hostname: string | null;
  ip_address: string | null;
  agent_id: string | null;
  agent_name: string | null;
  client_id: string | null;
  client_name: string | null;
  created_at: string;
  wait_days: number;
  revision: PendingQueueRevision;
}

export interface PendingQueueResponse {
  rows: PendingQueueRow[];
  total: number;
}

/** Tira de 5 métricas del header (handoff hifi) — endpoint aparte
 * (`GET /devices/pending/summary`), independiente del listado paginado. */
export interface PendingQueueSummary {
  pending_total: number;
  pending_clients: number;
  discovered_today: number;
  discovered_yesterday: number;
  waiting_7d_plus: number;
  possible_duplicates: number;
  approved_this_month: number;
  ignored_this_month: number;
}
