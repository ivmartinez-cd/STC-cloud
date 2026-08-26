import HifiPagination from '../../../shared/components/HifiPagination';
import { PAGE_SIZE } from '../lib/alertPresentation';

interface Props { page: number; total: number; totalPages: number; onChange: (page: number) => void }

/** Handoff hifi #3, 26/08/2026 — reemplaza la paginación "ciega" anterior
 * (sin total, sólo deshabilitaba SIGUIENTE cuando la página venía incompleta)
 * por `HifiPagination` con el total real de `GET /alerts/count`. */
export default function AlertsPagination({ page, total, totalPages, onChange }: Props) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} itemLabel="alertas" onPageChange={onChange} />;
}
