import type {
  SupplyCycle, SupplyLevelPoint, SupplyReplacement, SupplyRequestHistoryRow,
} from "../entities/supply-history";

const DAY_MS = 86_400_000;

const EMPTY_CYCLE: SupplyCycle = {
  started_at: null, initial_level: null, current_level: null, used_pct: null, days_in_use: null,
  cycles_at_start: null, cycles_in: null, mono_printed: null, color_printed: null,
  total_printed: null, est_total_remaining: null, est_color_remaining: null,
};

/**
 * Reemplazos = el nivel sube al menos `risePct` puntos entre dos lecturas con
 * nivel conocido. El umbral se INYECTA (`AUTO_COMPLETE_RISE_PCT` del módulo
 * de pedidos, desde la capa de aplicación) en vez de importarse acá: el
 * dominio no conoce otros módulos (`check-guards`, regla `arch-domain`).
 *
 * Que sea el mismo umbral que el auto-cierre de pedidos es deliberado: si la
 * app dice "pedido completado, cartucho cambiado", el gráfico tiene que
 * marcar el mismo día. Un rebote de ±10 puntos de una lectura SNMP no llega.
 */
export function detectReplacements(points: SupplyLevelPoint[], risePct: number): SupplyReplacement[] {
  const out: SupplyReplacement[] = [];
  let prev: { day: string; level: number } | null = null;
  for (const p of points) {
    if (p.level == null) continue;
    if (prev && p.level >= prev.level + risePct) {
      out.push({ at: p.day, from_pct: prev.level, to_pct: p.level });
    }
    prev = { day: p.day, level: p.level };
  }
  return out;
}

/** Puntos del ciclo vigente: desde el último reemplazo (inclusive) hasta el final. */
function currentCyclePoints(points: SupplyLevelPoint[], replacements: SupplyReplacement[]): SupplyLevelPoint[] {
  const last = replacements.at(-1);
  if (!last) return points;
  const from = points.findIndex((p) => p.day === last.at);
  return from < 0 ? points : points.slice(from);
}

function delta(first: number | null, last: number | null): number | null {
  if (first == null || last == null || last < first) return null;
  return last - first;
}

/** Páginas por punto de nivel consumido × nivel actual. `null` si el ciclo todavía no gastó nada. */
function estimate(printed: number | null, usedPct: number | null, currentLevel: number | null): number | null {
  if (printed == null || usedPct == null || usedPct <= 0 || currentLevel == null) return null;
  return Math.round((printed / usedPct) * currentLevel);
}

function cycleSpan(points: SupplyLevelPoint[]) {
  const first = points[0], last = points[points.length - 1];
  return {
    first, last,
    days: Math.max(0, Math.round((new Date(last.day).getTime() - new Date(first.day).getTime()) / DAY_MS)),
  };
}

/** "Detalles de rendimiento": todo se mide desde el último reemplazo, nunca desde el inicio de la serie. */
export function buildCycle(points: SupplyLevelPoint[], replacements: SupplyReplacement[]): SupplyCycle {
  const cycle = currentCyclePoints(points, replacements).filter((p) => p.level != null);
  if (!cycle.length) return EMPTY_CYCLE;
  const { first, last, days } = cycleSpan(cycle);
  const usedPct = first.level! >= last.level! ? first.level! - last.level! : null;
  const totalPrinted = delta(first.total_pages, last.total_pages);
  const colorPrinted = delta(first.color_pages, last.color_pages);
  return {
    started_at: first.day, initial_level: first.level, current_level: last.level,
    used_pct: usedPct, days_in_use: days,
    cycles_at_start: first.total_pages, cycles_in: totalPrinted,
    mono_printed: delta(first.mono_pages, last.mono_pages),
    color_printed: colorPrinted, total_printed: totalPrinted,
    est_total_remaining: estimate(totalPrinted, usedPct, last.level),
    est_color_remaining: estimate(colorPrinted, usedPct, last.level),
  };
}

/**
 * Δ total / Δ color del SDS: contadores de esta solicitud menos los de la
 * anterior del mismo consumible — o sea, lo que el equipo imprimió entre un
 * cartucho y el siguiente. `null` si a alguna de las dos le falta el
 * snapshot (solicitudes anteriores a la migración 20260915120000).
 */
export function withRequestDeltas(ascending: SupplyRequestHistoryRow[]): SupplyRequestHistoryRow[] {
  const out = ascending.map((row, i) => {
    const prev = i > 0 ? ascending[i - 1] : null;
    return {
      ...row,
      delta_total: prev ? delta(prev.total_pages ?? null, row.total_pages ?? null) : null,
      delta_color: prev ? delta(prev.color_pages, row.color_pages) : null,
    };
  });
  return out.reverse();
}
