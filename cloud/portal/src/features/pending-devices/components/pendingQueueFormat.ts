import type { PendingRevision } from '../types/pendingDevices';

/** Helpers puros de formateo — separados del JSX para respetar el límite de
 * 20 líneas/función de la guía. Reimplementados localmente a propósito
 * (`brandBadge` existe también en `features/devices/*`): cruzar features está
 * prohibido (`arch-portal`). */

export function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}

/** "N días" si ya pasó al menos 1 día completo (`wait_days`, calculado en el
 * servidor); "hace N h" con precisión horaria para lo descubierto hoy mismo
 * (handoff hifi: "N días" / "hace N h"). */
export function formatWait(waitDays: number, createdAt: string): string {
  if (waitDays >= 1) return `${waitDays} día${waitDays === 1 ? '' : 's'}`;
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  return `hace ${hours} h`;
}

export const REVISION_LABEL: Record<PendingRevision, string> = {
  nuevo: 'NUEVO', duplicado: 'POSIBLE DUPLICADO', sin_cliente: 'SIN CLIENTE',
};

/** `nuevo` → neutral (default dot `brand-gray`); `duplicado`/`sin_cliente` →
 * attention (default dot `brand`) — los 3 estados calzan con los defaults de
 * `EstadoChip`, no hace falta `dotClassName`. */
export const REVISION_VARIANT: Record<PendingRevision, 'neutral' | 'attention'> = {
  nuevo: 'neutral', duplicado: 'attention', sin_cliente: 'attention',
};

export const ACTION_LABEL: Record<PendingRevision, string> = {
  duplicado: 'REVISAR →', sin_cliente: 'ASIGNAR →', nuevo: 'APROBAR →',
};
