/** Estados de tabla genéricos (handoff hifi #3, 26/08/2026) — el trío
 * error/vacío/skeleton reimplementado inline en las 8 tablas hifi existentes
 * (`ClientsDirectoryTable.tsx`, `DeviceDirectoryTable.tsx`, etc.), byte-idéntico
 * salvo el texto. `CardError`/`CardEmpty`/`SkeletonBlock` en `shared/` ya
 * cubren tarjetas sueltas; éste es el molde específico de fila de tabla
 * (`py-20`, ancho completo del `role="table"`). */

export function TableErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-900">{message}</span>
      <button
        type="button" onClick={onRetry}
        className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        Reintentar
      </button>
    </div>
  );
}

export function TableEmptyState({ message, hasActiveFilters, onClearFilters }: {
  message: string; hasActiveFilters?: boolean; onClearFilters?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-300">{message}</span>
      {hasActiveFilters && onClearFilters && (
        <button
          type="button" onClick={onClearFilters}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Una fila de skeleton — `widths` define cuántas celdas dibuja y su ancho
 * relativo (`w-2/5` etc). El caller decide cuántas filas repetir. */
export function TableSkeletonRow({ gridCols, widths }: { gridCols: string; widths: string[] }) {
  return (
    <div className={`grid ${gridCols} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
      {widths.map((w, i) => (
        <span key={i} className={w ? `h-3 ${w} animate-pulse rounded bg-surface-track` : undefined} />
      ))}
    </div>
  );
}
