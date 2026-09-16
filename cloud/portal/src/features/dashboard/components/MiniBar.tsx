/** Barra de progreso inline reusada por las filas de "Alertas por clase",
 * "Marcas del parque" y "Cuentas por equipos". Alto y radio configurables: el
 * rediseño minimalista (handoff 16/09/2026) las usa todas con `radius={0}` —
 * 6px en las filas de clase y marca, 4px bajo el nombre de cuenta. */
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
