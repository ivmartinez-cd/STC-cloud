/**
 * Entidad del dominio "pedido de consumible" (Fase 4.2 del gap analysis vs
 * HP SDS). Puro: sin Knex/Fastify. Los estados calcan el pipeline del SDS
 * ("eliminada" → `cancelled`, acá no se borran filas).
 */

export const REQUEST_STATUSES = [
  "pending", "reviewed", "processed", "completed", "ignored", "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const OPEN_STATUSES: readonly RequestStatus[] = ["pending", "reviewed", "processed"];

export type RequestOrigin = "auto" | "manual";

/**
 * Motivo del pedido, calcado del SDS ("Nivel bajo" / "Tiempo de ejecución").
 * Hoy el worker sólo dispara por nivel; `runtime` queda declarado para
 * cuando exista un disparador por días restantes (el CHECK ya lo acepta,
 * ver la migración 20260915120000).
 */
export const REQUEST_REASONS = ["low_level", "runtime", "manual"] as const;
export type RequestReason = (typeof REQUEST_REASONS)[number];

export interface SupplyRequest {
  id: string;
  clientId: string;
  deviceId: string | null;
  deviceSerial: string | null;
  deviceLabel: string | null;
  supplyKey: string;
  supplyKind: string;
  supplyColor: string | null;
  description: string | null;
  sku: string | null;
  levelPct: number | null;
  remainingDays: number | null;
  /** Snapshot de lectura al abrir (migración 20260915120000) — `null` en pedidos anteriores. */
  supplySerial: string | null;
  externalRef: string | null;
  reason: RequestReason | null;
  monoPages: number | null;
  colorPages: number | null;
  totalPages: number | null;
  replacedAt: Date | null;
  status: RequestStatus;
  origin: RequestOrigin;
  openedAt: Date;
  closedAt: Date | null;
  notes: string | null;
  createdBy: string | null;
  updatedAt: Date;
  /** Handoff hifi #3, fase 3, 26/08/2026 — id de OTRO pedido abierto para el
   * mismo (deviceId, supplyKey). El índice único parcial sólo bloquea dos
   * pedidos `origin='auto'` simultáneos; uno manual + uno auto para el mismo
   * consumible SÍ pueden coexistir, y son el "probable duplicado" real que
   * el banner de Pedidos señala. Se computa en `list()` (no persiste). */
  possibleDuplicateOf: string | null;
}

/**
 * Transiciones válidas: el flujo feliz avanza pendiente→consultada→procesada
 * →completada; ignorar/cancelar se permite desde cualquier estado abierto.
 * Un pedido cerrado no transiciona más (si el consumible sigue bajo umbral,
 * el worker abre un pedido nuevo — decisión documentada en la migración).
 */
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ["reviewed", "processed", "completed", "ignored", "cancelled"],
  reviewed: ["processed", "completed", "ignored", "cancelled"],
  processed: ["completed", "ignored", "cancelled"],
  completed: [],
  ignored: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isOpen(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Señal de reemplazo de cartucho: el nivel actual subió al menos
 * AUTO_COMPLETE_RISE_PCT puntos sobre el nivel con el que se abrió el
 * pedido (mismo criterio que usa `sdsinsumos` contra el SDS: nivel que
 * sube = cartucho cambiado; un rebote de lectura de ±10 puntos no alcanza).
 */
export const AUTO_COMPLETE_RISE_PCT = 30;

export function replacementDetected(openedLevelPct: number | null, currentPct: number | null): boolean {
  if (currentPct == null) return false;
  const base = openedLevelPct ?? 0;
  return currentPct >= base + AUTO_COMPLETE_RISE_PCT;
}
