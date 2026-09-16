/**
 * Celda de variación de las tablas ("Alertas por clase", "Severidad"): mono
 * tabular, rojo si sube, verde si baja, guion si no cambió.
 *
 * `null` = no hay historia todavía para esa fila (ver `lib/trend.ts`) y no se
 * dibuja nada — un "—" ahí significaría "no cambió", que no es lo mismo.
 *
 * En estas dos tablas subir es siempre peor (son alertas), por eso no hay
 * `worseWhen` como en el titular: acá el signo alcanza.
 */
export default function Delta({ value, className = '' }: { value: number | null; className?: string }) {
  if (value == null) return <span className={className} />;
  if (value === 0) return <span className={`font-mono text-[11px] tabular-nums text-ink-300 ${className}`}>—</span>;
  return (
    <span className={`font-mono text-[11px] tabular-nums ${value > 0 ? 'text-severity-critical' : 'text-severity-ok'} ${className}`}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}
