/** "Vista" guardada de Movimientos — un preset con nombre de los filtros
 * de `/activity`, personal del operador que lo creó. */
export interface ActivitySavedView {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: Date;
}
