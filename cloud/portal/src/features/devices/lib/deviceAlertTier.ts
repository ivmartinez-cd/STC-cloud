import type { AlertClass } from '../../../shared/types/alerts';

export type AlertTier = 'ALTA' | 'MEDIA' | 'BAJA';

/** Mismo criterio de bucketing que `CLASS_COLOR` en `features/alerts/lib/alertPresentation.ts`
 * (rojo = ya pasó algo, ámbar = requiere atención, gris = informativo) — no se
 * importa cruzando de feature (guard `arch-portal`), se replica el bucket acá
 * porque sólo estas 2 clases bajan a "BAJA" para este tarjeta. */
const LOW_PRIORITY_CLASSES: AlertClass[] = ['information', 'system_change'];

/** `severityRaw` puede venir en dos formas: `AlertSeverity` del servidor
 * (`critical`/`warning`, minúscula) o el string libre que reporta el propio
 * equipo (`supplies_details.alerts[].severity`, sin clase asociada). */
export function alertTierOf(severityRaw: string, alertClass?: AlertClass | null): AlertTier {
  if (alertClass && LOW_PRIORITY_CLASSES.includes(alertClass)) return 'BAJA';
  const s = severityRaw.toUpperCase();
  if (s === 'CRITICAL' || s === 'ALTA' || s === 'ERROR') return 'ALTA';
  if (s === 'INFO' || s === 'BAJA') return 'BAJA';
  return 'MEDIA';
}

/** Colores exactos del mockup: ALTA/MEDIA comparten fondo+texto (`brand-soft`/
 * `brand-accent`), sólo el punto cambia de intensidad; BAJA es el chip neutro. */
export const ALERT_TIER_STYLE: Record<AlertTier, { bg: string; fg: string; dot: string }> = {
  ALTA:  { bg: 'bg-brand-soft', fg: 'text-brand-accent', dot: 'bg-brand-severe' },
  MEDIA: { bg: 'bg-brand-soft', fg: 'text-brand-accent', dot: 'bg-brand' },
  BAJA:  { bg: 'bg-surface-avatar', fg: 'text-ink-650', dot: 'bg-brand-gray' },
};
