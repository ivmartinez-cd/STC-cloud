/**
 * Agrupación de las clases de alerta en los tres tonos que usa el panel
 * (críticas / advertencias / informativas).
 *
 * No existe una severidad real por `alert_class` en el backend — sólo
 * `alerts.severity`, por instancia (ver `ALERT_CLASS_LABELS` en
 * `cloud/src/modules/alerts/domain/entities/alert.ts`). Esta es la misma
 * agrupación visual de 3 tonos que el panel ya venía usando; vive acá desde el
 * rediseño del 16/09/2026 porque ahora la comparten tres paneles: "Alertas por
 * clase", "Severidad" y los puntos de mezcla de "Dónde se concentran".
 *
 * `availability` y `system_change` se pliegan a "atención" e "informativa"
 * respectivamente: la barra apilada necesita exactamente 3 baldes.
 */

export type Tier = 'critical' | 'warning' | 'info';

export const TIERS: readonly Tier[] = ['critical', 'warning', 'info'];

const CLASS_TIER: Record<string, Tier> = {
  consumable_out: 'critical',
  system_failure: 'critical',
  jam: 'critical',
  subunit_out: 'critical',
  media_out: 'critical',
  availability: 'warning',
  consumable_low: 'warning',
  system_warning: 'warning',
  user_action: 'warning',
  subunit_low: 'warning',
  media_low: 'warning',
  information: 'info',
  system_change: 'info',
  other: 'info',
};

export const TIER_COLOR: Record<Tier, string> = {
  critical: 'var(--color-severity-critical)',
  warning: 'var(--color-brand-light)',
  info: 'var(--color-ink-500)',
};

export const TIER_LABEL: Record<Tier, string> = {
  critical: 'Críticas',
  warning: 'Advertencias',
  info: 'Informativas',
};

export function tierOf(alertClass: string): Tier {
  return CLASS_TIER[alertClass] ?? 'info';
}

/** Suma un `{clase: cantidad}` en los tres baldes. */
export function tierTotals(byClass: Record<string, number>): Record<Tier, number> {
  const out: Record<Tier, number> = { critical: 0, warning: 0, info: 0 };
  for (const [cls, n] of Object.entries(byClass)) out[tierOf(cls)] += n;
  return out;
}

/**
 * Reparte `slots` cuadrados entre los tres tonos — la "mezcla de severidad" de
 * cada fila de hotspot.
 *
 * Primero un cuadrado a CADA tono presente y recién después se reparte el
 * resto por proporción. No es reparto proporcional puro a propósito: un equipo
 * con 10 informativas y 1 crítica saldría gris entero por redondeo, y esa
 * crítica es justamente lo que hay que ver. Con tres tonos y tres cuadrados el
 * piso siempre entra.
 *
 * El orden es siempre crítica → advertencia → informativa, para que dos filas
 * se comparen de un vistazo.
 */
export function severityMix(byClass: Record<string, number>, slots = 3): Tier[] {
  const totals = tierTotals(byClass);
  const present = TIERS.filter((t) => totals[t] > 0);
  if (present.length === 0) return [];
  const sum = present.reduce((a, t) => a + totals[t], 0);
  const mix = new Map<Tier, number>(present.map((t) => [t, 1]));
  let left = slots - present.length;
  // Los que queden van al tono con más peso relativo todavía sin cubrir.
  const byWeight = [...present].sort((a, b) => totals[b] / sum - totals[a] / sum);
  for (let i = 0; left > 0; i = (i + 1) % byWeight.length, left--) {
    mix.set(byWeight[i], (mix.get(byWeight[i]) ?? 0) + 1);
  }
  return TIERS.flatMap((t) => Array.from({ length: mix.get(t) ?? 0 }, () => t));
}
