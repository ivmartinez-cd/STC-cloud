export interface BarSegment {
  pct: number;
  color: string;
}

/** Barra apilada por segmentos (handoff hifi "4 pantallas"): Salud de Nodos
 * la usa para distribución por antigüedad de señal (una barra, N buckets),
 * Acciones Remotas para resultado por tipo de acción (una barra por tipo,
 * 3 segmentos ok/error/cancelado) — cada pantalla arma su propia lista/leyenda
 * alrededor, este componente sólo dibuja la barra en sí. */
export default function SegmentedBar({ segments, heightPx = 8 }: { segments: BarSegment[]; heightPx?: number }) {
  return (
    <div className="flex overflow-hidden rounded-[4px]" style={{ height: heightPx }}>
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${Math.max(s.pct, s.pct > 0 ? 0.4 : 0)}%`, background: s.color }} />
      ))}
    </div>
  );
}
