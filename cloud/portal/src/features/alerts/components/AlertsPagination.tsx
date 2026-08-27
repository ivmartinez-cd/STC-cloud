import HifiPagination from '../../../shared/components/HifiPagination';

interface Props { page: number; total: number; totalPages: number; pageSize: number; onChange: (page: number) => void }

/** Handoff hifi #3, 26/08/2026 — reemplaza la paginación "ciega" anterior
 * (sin total, sólo deshabilitaba SIGUIENTE cuando la página venía incompleta)
 * por `HifiPagination` con el total real de `GET /alerts/count`. */
export default function AlertsPagination({ page, total, totalPages, pageSize, onChange }: Props) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="alertas" onPageChange={onChange} />;
}
