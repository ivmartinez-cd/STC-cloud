import { fmt } from '../../../../shared/lib/formatters';
import HifiPagination from '../../../../shared/components/HifiPagination';

/** Paginación de "Salud de nodos" — envoltorio fino sobre `HifiPagination`
 * (la copia local se unificó el 27/08/2026 al pasar a tamaño de página
 * dinámico). La nota "N sin señal desde hace más de 6 horas" del footer
 * (handoff) va pegada al label de ítems porque `HifiPagination` no tiene
 * slot para texto extra. */
export default function AgentsPagination({
  page, totalPages, total, pageSize, staleCount, onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  staleCount: number;
  onPageChange: (p: number) => void;
}) {
  const itemLabel = `nodos · ${fmt(staleCount)} sin señal desde hace más de 6 horas`;
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel={itemLabel} onPageChange={onPageChange} />;
}
