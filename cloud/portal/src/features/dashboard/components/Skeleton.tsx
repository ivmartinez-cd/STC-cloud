import type { CSSProperties } from 'react';

/** Bloque de skeleton (README: "mismo alto que la fila/celda final, fondo
 * #F0F2F2, sin spinners"). `heightPx` reproduce el alto real de lo que va a
 * reemplazar (una fila, una cifra, una barra) para que no salte el layout. */
export default function SkeletonBlock({
  heightPx = 12, widthPct = 100, className = '', style,
}: {
  heightPx?: number;
  widthPct?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`block animate-pulse rounded bg-surface-track ${className}`}
      style={{ height: heightPx, width: `${widthPct}%`, ...style }}
    />
  );
}
