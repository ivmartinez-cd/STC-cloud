import { sparkPoints } from '../lib/trend';

/**
 * Curva de 7 (o 24, o 30) puntos bajo cada cifra del titular — handoff "Panel
 * de control", 16/09/2026.
 *
 * `viewBox` fijo de 80×24 con `preserveAspectRatio="none"` para que se estire
 * al ancho de la celda sin recalcular nada, y `vector-effect="non-scaling-stroke"`
 * para que ese estiramiento no engorde el trazo. Sin ejes, sin grilla y sin
 * etiquetas: acá la forma es el dato, el número exacto está arriba.
 *
 * Decorativa a efectos de accesibilidad (`aria-hidden`): el valor y la
 * variación ya están en texto al lado, un lector de pantalla no gana nada
 * leyendo la curva.
 */
export default function Sparkline({ values, color, className = '' }: {
  values: number[];
  color: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  return (
    <svg
      viewBox="0 0 80 24"
      width="100%"
      height={22}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`block ${className}`}
    >
      <polyline
        points={sparkPoints(values)}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
