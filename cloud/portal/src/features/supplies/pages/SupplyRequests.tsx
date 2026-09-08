import PageHeader from '../../../shared/components/PageHeader';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useSupplyRequestsPage } from '../hooks/useSupplyRequestsPage';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import SupplyRequestsTabs from '../components/SupplyRequestsTabs';
import SupplyRequestsTable from '../components/SupplyRequestsTable';
import SupplyRequestsDuplicateBanner from '../components/SupplyRequestsDuplicateBanner';
import SupplyRequestDetailModal from '../components/SupplyRequestDetailModal';

/** Pedidos (handoff hifi #3, fase 3, 26/08/2026) — se abren solos al cruzar
 * el umbral y se completan solos al detectar el reemplazo; el header lo
 * explica en vez de dejarlo implícito. "+ NUEVO PEDIDO" del mockup no tiene
 * flujo de creación manual sin equipo en esta pantalla — crear pedidos
 * puntuales ya vive en Consumibles (fila → GENERAR PEDIDO) y en el detalle
 * de equipo; no se duplica el flujo acá. */
export default function SupplyRequests() {
  const fit = useFitRows({ estimate: 54 });
  const s = useSupplyRequestsPage(fit.rows);

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="SOLICITUDES DE CONSUMIBLES" title="Pedidos"
        subtitle="Se abren solos al cruzar el umbral configurado y se completan solos al detectar el reemplazo del consumible. Los pedidos manuales requieren confirmación de un operador."
        actions={s.canManage && (
          <select value={s.filters.clientId} onChange={(e) => s.filters.setClientId(e.target.value)}
            className="min-w-[190px] rounded-[3px] border border-line-100 bg-white px-3 py-[11px] font-sans text-[12px] font-semibold text-ink-600 outline-none focus:border-brand">
            <option value="">Todos los clientes</option>
            {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      />

      {/* Las tabs son parte fija de la tarjeta; sólo el bloque de la tabla
          crece. El banner de duplicados queda afuera, debajo. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <SupplyRequestsTabs active={s.filters.tab} onChange={s.filters.setTab} countOf={s.countOf} />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <SupplyRequestsTable items={s.items} clientName={s.clientName} loading={s.loading} onOpen={s.setDetailId} skeletonRows={fit.rows} />
        </div>
        <HifiPagination page={s.filters.page} totalPages={s.totalPages} total={s.total} pageSize={s.pageSize} itemLabel="pedidos" onPageChange={s.filters.setPage} />
      </div>

      {s.duplicatePair && (
        <div className="mt-4">
          <SupplyRequestsDuplicateBanner request={s.duplicatePair} sibling={s.duplicateSibling} onReview={s.setDetailId} />
        </div>
      )}

      <SupplyRequestDetailModal requestId={s.detailId} onClose={() => s.setDetailId(null)} onChanged={s.reload} canManage={s.canManage} />
    </div>
  );
}
