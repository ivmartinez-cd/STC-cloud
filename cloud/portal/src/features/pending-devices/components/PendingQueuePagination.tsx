import HifiPagination from '../../../shared/components/HifiPagination';
import { fmt } from '../../../shared/lib/formatters';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  waiting7dPlus: number;
  onPageChange: (p: number) => void;
}

/** "1–9 de 33 pendientes · 6 esperando más de 7 días" (handoff hifi) — envoltorio
 * fino sobre `HifiPagination` (la copia local se unificó el 27/08/2026 al pasar
 * a tamaño de página dinámico). */
export default function PendingQueuePagination({ page, totalPages, total, pageSize, waiting7dPlus, onPageChange }: Props) {
  const itemLabel = `pendientes · ${fmt(waiting7dPlus)} esperando más de 7 días`;
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel={itemLabel} onPageChange={onPageChange} />;
}
