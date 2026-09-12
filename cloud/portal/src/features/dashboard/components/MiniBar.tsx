/** Barra de progreso inline reusada por la tira de KPIs, las filas de
 * "Alertas por clase" y "Top cuentas": track `#F0F2F2`, relleno de un solo
 * color (institucional o de `--color-severity-*` según el caso). Alto y
 * radio configurables porque el handoff usa 4px (mini KPI), 6px (fila) y
 * 7-8px (apiladas) según el bloque. */
export default function MiniBar({
  pct, color = 'var(--color-brand)', height = 6, radius = 3, className = '', minPct,
}: {
  pct: number;
  /** Color CSS del relleno — hex o `var(--color-*)`. */
  color?: string;
  height?: number;
  radius?: number;
  className?: string;
  /** Piso visual para que una barra con datos reales nunca desaparezca del todo. */
  minPct?: number;
}) {
  const width = Math.max(minPct ?? 0, Math.min(100, pct));
  return (
    <span
      className={`block w-full overflow-hidden bg-surface-track ${className}`}
      style={{ height, borderRadius: radius }}
    >
      <span className="block h-full" style={{ width: `${width}%`, backgroundColor: color, borderRadius: radius }} />
    </span>
  );
}
