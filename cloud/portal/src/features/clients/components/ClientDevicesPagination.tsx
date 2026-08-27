import HifiPagination from '../../../shared/components/HifiPagination';

/** Paginación de "Infraestructura de monitoreo" — envoltorio fino sobre
 * `HifiPagination` (la copia local se unificó el 27/08/2026 al pasar a tamaño
 * de página dinámico, igual que `ClientsPagination.tsx`). */
export default function ClientDevicesPagination({
  page, totalPages, total, pageSize, onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel="dispositivos" onPageChange={onPageChange} />;
}
