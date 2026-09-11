/**
 * Página a pedir/mostrar: la elegida (estado / `?page=`) acotada a la última que
 * existe para el `total` y `pageSize` actuales. NO muta el estado: `pageSize` es
 * transitorio al montar (`useFitRows` converge en varios pasos: mínimo → estimado →
 * medida real, y el alto cambia al cargar fuentes o aparecer el pie de paginación),
 * y persistir un clamp calculado con un tamaño transitorio pisaba un `?page=` válido.
 * Con `total` desconocido (0) devuelve la elegida.
 */
export function clampPage(page: number, pageSize: number, total: number): number {
  if (total <= 0 || pageSize <= 0) return page;
  return Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
}
