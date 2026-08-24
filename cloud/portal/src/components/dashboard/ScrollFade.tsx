/** Overlay estático (no CSS mask, no interfiere con el scrollbar real) que
 * indica "hay más contenido abajo" en las cards del Dashboard con scroll
 * interno. Se superpone siempre — si el contenido entra sin scroll, el
 * degradé cae sobre espacio vacío y no se nota; si no entra, marca
 * claramente que hay más en vez de dejar la última fila cortada a la mitad
 * sin ninguna señal. El padre debe ser `relative`. */
export default function ScrollFade() {
  return <div className="pointer-events-none absolute bottom-0 inset-x-0 h-5 bg-gradient-to-t from-white to-transparent rounded-b-[24px]" />;
}
