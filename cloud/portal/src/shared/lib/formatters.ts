import { DEVICE_OFFLINE_THRESHOLD_MS } from './constants';

export function formatRelativeTime(ts: string | null, now = Date.now()): string {
  if (!ts) return 'Nunca';
  const min = Math.floor((now - new Date(ts).getTime()) / 60_000);
  if (min < 2)  return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return new Date(ts).toLocaleString('es-AR');
}

export function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export interface DeviceStatusInfo {
  status: 'online' | 'warning' | 'critical';
  label: string;
  subtext: string;
  badgeClass: string;
  dotClass: string;
  textClass: string;
  iconBgClass: string;
}

export const DEVICE_CRITICAL_OFFLINE_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 horas

export function getDeviceStatusInfo(lastSeenStr: string | null | undefined, now = Date.now()): DeviceStatusInfo {
  if (!lastSeenStr) {
    return {
      status: 'critical',
      label: 'Sin Contacto (+72h)',
      subtext: 'Sin registros de conexión',
      badgeClass: 'bg-rose-50 text-rose-600 border-rose-200',
      dotClass: 'bg-rose-500',
      textClass: 'text-rose-600',
      iconBgClass: 'bg-rose-50 text-rose-600',
    };
  }

  const lastSeen = new Date(lastSeenStr);
  const diffMs = Math.abs(now - lastSeen.getTime());

  // Bug real (23/08/2026): tenía su PROPIO umbral hardcodeado de 30 min,
  // independiente de `DEVICE_OFFLINE_THRESHOLD_MS` (constants.ts) — un
  // tercer umbral de "offline" además del de `constants.ts` y el de
  // `cloud/src/jobs/heartbeatMonitor.ts`, exactamente el problema que
  // documenta el gap analysis ("modelo unificado de umbrales"). Es el que
  // realmente pinta "SIN CONTACTO" en `DeviceInventoryTable.tsx` — unificado acá
  // al mismo valor que los otros dos (ver comentario en `constants.ts`).
  if (diffMs <= DEVICE_OFFLINE_THRESHOLD_MS) {
    return {
      status: 'online',
      label: 'En Línea',
      subtext: 'Conexión OK',
      badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
      iconBgClass: 'bg-emerald-50 text-emerald-600',
    };
  }

  const dateFormatted = lastSeen.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs <= DEVICE_CRITICAL_OFFLINE_THRESHOLD_MS) {
    const timeAgo = diffHours < 1 ? `hace ${Math.floor(diffMs / 60000)}m` : `hace ${diffHours}h`;
    return {
      status: 'warning',
      label: 'Sin Contacto',
      subtext: `Desde ${dateFormatted} (${timeAgo})`,
      badgeClass: 'bg-amber-50 text-amber-600 border-amber-200',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-500',
      iconBgClass: 'bg-amber-50 text-amber-500',
    };
  } else {
    return {
      status: 'critical',
      label: 'Sin Contacto (+72h)',
      subtext: `Desde ${dateFormatted} (${diffDays}d sin contacto)`,
      badgeClass: 'bg-rose-50 text-rose-600 border-rose-200',
      dotClass: 'bg-rose-500',
      textClass: 'text-rose-600',
      iconBgClass: 'bg-rose-50 text-rose-600',
    };
  }
}

/** Porcentaje con 1 decimal como máximo (0 si el total es 0). */
export function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export function fmtPct(part: number, total: number): string {
  return `${pctOf(part, total).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

/** Formateo `es-AR` (punto de miles) — helper reusado por todo el Panel de
 * Control hifi (README: "Números: locale es-AR... usar en toda cifra"). */
export function fmt(n: number): string {
  return n.toLocaleString('es-AR');
}
