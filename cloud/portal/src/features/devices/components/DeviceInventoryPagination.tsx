import HifiPagination from '../../../shared/components/HifiPagination';
import { fmt } from '../../../shared/lib/formatters';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  clientsInPage: number;
  clientsTotal: number | null;
  onPageChange: (p: number) => void;
}

/** "1–12 de 1.891 dispositivos · N de M clientes en esta página" (handoff hifi) — `M`
 * es el total de clientes de la CARTERA (tira de métricas), `N` los que caen en la
 * página actual (cuántos `groups` trajo `GET /devices/directory`). Envoltorio fino
 * sobre `HifiPagination` (la copia local se unificó el 27/08/2026 al pasar a
 * tamaño de página dinámico). */
export default function DeviceInventoryPagination({ page, totalPages, total, pageSize, clientsInPage, clientsTotal, onPageChange }: Props) {
  const itemLabel = `dispositivos · ${fmt(clientsInPage)} de ${clientsTotal != null ? fmt(clientsTotal) : '—'} clientes en esta página`;
  return <HifiPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} itemLabel={itemLabel} onPageChange={onPageChange} />;
}
