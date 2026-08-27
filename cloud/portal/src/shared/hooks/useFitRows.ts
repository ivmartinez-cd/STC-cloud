import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Options {
  /** Alto estimado de una fila (px) hasta que haya una fila real para medir. */
  estimate: number;
  /** Piso de filas por página — nunca menos, aunque la ventana sea muy baja. */
  min?: number;
  /** Techo — coincide con el `limit` máximo que aceptan los endpoints (200). */
  max?: number;
  /** Filas a descontar (ej. cabeceras de grupo que la tabla intercala). */
  reserveRows?: number;
}

const DEFAULTS = { min: 3, max: 200, reserveRows: 0 };
const RESIZE_DEBOUNCE_MS = 150;

/**
 * Cuántas filas entran en un contenedor de alto fijo — la base de "toda
 * pantalla entra en el viewport sin scroll" (27/08/2026): en vez de paginar
 * de a 50 y scrollear, cada tabla pide al servidor exactamente las filas que
 * caben en el alto que le dejó el resto de la pantalla.
 *
 * Uso: `const fit = useFitRows({ estimate: 54 })`; poner `ref={fit.ref}` en el
 * contenedor que crece (`flex-1 min-h-0 overflow-hidden`), marcar cada fila
 * con `data-fit-row` (se mide la primera real, así el estimado sólo importa
 * en el primer render) y las partes fijas dentro del contenedor (cabecera de
 * tabla, barras) con `data-fit-fixed` para descontarlas.
 *
 * El contenedor tiene que tener el alto determinado por sus hermanos (flex),
 * nunca por su contenido — si no, medir el contenido cambiaría el contenedor
 * y se realimentaría. Con `overflow-hidden` un píxel de sobra se recorta en
 * vez de abrir scroll.
 */
export function useFitRows(options: Options) {
  const { estimate } = options;
  const min = options.min ?? DEFAULTS.min;
  const max = options.max ?? DEFAULTS.max;
  const reserveRows = options.reserveRows ?? DEFAULTS.reserveRows;

  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(min);
  const timer = useRef<number | null>(null);
  const measured = useRef(false);

  const compute = useCallback((): number | null => {
    const el = ref.current;
    if (!el) return null;
    const available = el.clientHeight;
    if (available <= 0) return null;
    const fixed = Array.from(el.querySelectorAll<HTMLElement>('[data-fit-fixed]'))
      .reduce((sum, f) => sum + f.offsetHeight, 0);
    const sample = el.querySelector<HTMLElement>('[data-fit-row]');
    const rowHeight = sample?.offsetHeight || estimate;
    const fits = Math.floor((available - fixed) / rowHeight) - reserveRows;
    return Math.max(min, Math.min(max, fits));
  }, [estimate, min, max, reserveRows]);

  const apply = useCallback((immediate: boolean) => {
    const run = () => {
      const next = compute();
      if (next !== null) setRows((prev) => (prev === next ? prev : next));
    };
    if (immediate) { run(); return; }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, RESIZE_DEBOUNCE_MS);
  }, [compute]);

  // Primer cálculo antes de pintar (evita el flash de `min` filas) y
  // recálculo tras cada render — converge en una pasada: estimado → filas
  // reales → medida real → mismo valor.
  useLayoutEffect(() => {
    apply(!measured.current);
    measured.current = true;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => apply(false));
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [apply]);

  return { ref, rows };
}
