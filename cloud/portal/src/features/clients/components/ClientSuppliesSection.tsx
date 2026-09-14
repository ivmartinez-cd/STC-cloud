import { Link } from 'react-router-dom';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import { useAuth } from '../../../store/AuthContext';
import { fmt } from '../../../shared/lib/formatters';
import { useSuppliesPage, type SuppliesPageState } from '../../supplies/hooks/useSuppliesPage';
import SuppliesFilterBar from '../../supplies/components/SuppliesFilterBar';
import SuppliesBulkBar from '../../supplies/components/SuppliesBulkBar';
import SuppliesTable from '../../supplies/components/SuppliesTable';

const LINK = 'font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline';

/** Rótulo + salida a la pantalla completa (con `from=` para volver acá tal cual). */
function SuppliesToolbar({ clientId, s }: { clientId: string; s: SuppliesPageState }) {
  const returnParam = useReturnParam();
  const critical = s.summary?.criticalCount ?? 0;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3.5">
      <ZoneLabel text={`Consumibles · ${fmt(s.summary?.total ?? 0)} ítems · ${fmt(critical)} críticos`} lineColorClass="bg-brand-gray" />
      <Link to={`/supplies?client_id=${clientId}&${returnParam}`} className={LINK}>Ver en Consumibles →</Link>
    </div>
  );
}

/**
 * Pestaña "Consumibles" de la ficha de cliente: la MISMA tabla, filtros y
 * generación de pedidos de la pantalla de Consumibles, con el alcance fijo en
 * este cliente (auditoría de navegación, 14/09/2026 — antes era un cartel con
 * un botón que sacaba al operador de la ficha). Sin selector de cliente: el
 * filtro es la pestaña.
 */
export default function ClientSuppliesSection({ clientId }: { clientId: string }) {
  const readOnly = useAuth().role === 'client_viewer';
  const fit = useFitRows({ estimate: 58 });
  const s = useSuppliesPage(fit.rows, { clientId });
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3.5">
      <SuppliesToolbar clientId={clientId} s={s} />
      <SuppliesCard s={s} fit={fit} readOnly={readOnly} />
    </section>
  );
}

/** La tarjeta: filtros (sin selector de cliente), barra de selección, tabla y paginación — igual que en la pantalla de Consumibles. */
function SuppliesCard({ s, fit, readOnly }: { s: SuppliesPageState; fit: ReturnType<typeof useFitRows>; readOnly: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
      <SuppliesFilterBar
        query={s.filters.rawQuery} onQueryChange={s.filters.setRawQuery}
        clientId={s.filters.clientId} onClientIdChange={s.filters.setClientId}
        canFilterByClient={false} clients={[]}
        kind={s.filters.kind} onKindChange={s.filters.setKind}
        urgency={s.filters.urgency} onUrgencyChange={s.filters.setUrgency}
      />
      {!readOnly && <SuppliesBulkBar count={s.rowSelection.count} busy={s.busy} onGenerate={() => void s.generateSelected()} onClear={s.rowSelection.clear} />}
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        <SuppliesTable items={s.items} readOnly={readOnly} selection={s.rowSelection} rowKey={s.rowKey} loading={s.loading} error={s.error} onRetry={s.fetchSupplies} skeletonRows={fit.rows} />
      </div>
      <HifiPagination page={s.filters.page} totalPages={s.totalPages} total={s.total} pageSize={s.pageSize} itemLabel="ítems" onPageChange={s.filters.setPage} />
    </div>
  );
}
