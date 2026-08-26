import { DEVICE_OFFLINE_THRESHOLD_MS } from './constants';

/**
 * Locale de todo el portal (pasada de polish de locale, 26/08/2026): antes
 * `'es-AR'` fijo en más de 30 archivos — un cliente en Chile/México veía
 * fechas y separadores de miles al estilo argentino en vez del propio
 * (`es-MX` en particular usa "," de miles/"." decimal, al revés que
 * `es-AR`). Preferimos el idioma del navegador SOLO si ya es español: el
 * resto de la copy de este portal está fija en castellano, así que dejar
 * que el navegador elija un locale no-español (ej. `en-US`) mostraría
 * fechas/números en inglés en medio de una UI toda en español — peor que
 * el default anterior. Sin `navigator` (SSR/tests) o sin variante español
 * detectada, cae al mismo default histórico.
 */
export const APP_LOCALE: string = (() => {
  if (typeof navigator === 'undefined') return 'es-AR';
  const preferred = navigator.languages?.find((l) => l.toLowerCase().startsWith('es')) ?? navigator.language;
  return preferred?.toLowerCase().startsWith('es') ? preferred : 'es-AR';
})();

export function formatRelativeTime(ts: string | null, now = Date.now()): string {
  if (!ts) return 'Nunca';
  const min = Math.floor((now - new Date(ts).getTime()) / 60_000);
  if (min < 2)  return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return new Date(ts).toLocaleString(APP_LOCALE);
}

export function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(APP_LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formato compacto `25-ago 07:47` (24h) — handoff hifi "4 pantallas"
 * (Acciones Remotas), en vez de `toLocaleString` que trae AM/PM. */
export function formatShortDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = SHORT_MONTHS[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month} ${hh}:${mm}`;
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

/**
 * "Modelo unificado de umbrales" (26/08/2026): `offlineThresholdMs` es
 * opcional (default = fallback estático de `constants.ts`) para no romper
 * a ningún caller existente, pero el caller real (`DeviceProfileCard.tsx`)
 * pasa el valor LIVE de `useSystemSettings()`.
 */
export function getDeviceStatusInfo(
  lastSeenStr: string | null | undefined,
  now = Date.now(),
  offlineThresholdMs = DEVICE_OFFLINE_THRESHOLD_MS
): DeviceStatusInfo {
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

  if (diffMs <= offlineThresholdMs) {
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

  const dateFormatted = lastSeen.toLocaleString(APP_LOCALE, {
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
  return `${pctOf(part, total).toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}%`;
}

/** Formateo con separador de miles del locale activo (`APP_LOCALE`, ver
 * arriba) — helper reusado por todo el Panel de Control hifi. La cita al
 * README ("Números: locale es-AR... usar en toda cifra") que tenía este
 * docblock ya no existe en `portal/README.md` — no se encontró en ningún
 * doc vivo del repo, así que se trataba de una nota histórica desactualizada,
 * no un mandato de producto vigente. */
export function fmt(n: number): string {
  return n.toLocaleString(APP_LOCALE);
}

/** Compacto tipo "5,3 M" (handoff hifi "Login", 26/08/2026) — sólo para la tira de
 * métricas de marca, donde el ancho de columna (148px) no da para el número completo. */
export function fmtCompact(n: number): string {
  return n.toLocaleString(APP_LOCALE, { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 });
}
