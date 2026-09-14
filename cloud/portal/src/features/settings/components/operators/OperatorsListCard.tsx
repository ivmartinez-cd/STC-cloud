import { Link } from 'react-router-dom';
import { useFitRows } from '../../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../../shared/hooks/useClientPagination';
import HifiPagination from '../../../../shared/components/HifiPagination';
import { operatorsBreakdown } from '../../lib/settingsPresentation';
import type { DBUser } from '../../types/settings';
import OperatorsFilterBar, { type OperatorFilter } from './OperatorsFilterBar';
import OperatorsTable from './OperatorsTable';

interface Props {
  users: DBUser[];
  filtered: DBUser[];
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  onOpen: (u: DBUser) => void;
  query: string;
  onQueryChange: (q: string) => void;
  filter: OperatorFilter;
  onFilterChange: (f: OperatorFilter) => void;
}

function Footer({ users }: { users: DBUser[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line-200 px-5 py-3.5">
      <span className="font-sans text-[12px] text-ink-300">{operatorsBreakdown(users)}</span>
      <Link to="/activity" className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">VER REGISTRO DE ACCESOS →</Link>
    </div>
  );
}

/** Tarjeta blanca filtro + tabla + paginación de operadores (27/08/2026,
 * "sin scroll"): `/portal/users` devuelve la lista entera, así que se pagina
 * en memoria con las filas que caben en el alto que dejó el resto de la tab. */
export default function OperatorsListCard(p: Props) {
  const fit = useFitRows({ estimate: 54 });
  const pager = useClientPagination(p.filtered, fit.rows);
  const ready = !p.loading && !p.error;
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
      <OperatorsFilterBar query={p.query} onQueryChange={p.onQueryChange} filter={p.filter} onFilterChange={p.onFilterChange} />
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        {p.error
          ? <div className="px-5 py-8 text-center font-sans text-[12.5px] text-ink-900">{p.error}</div>
          : <OperatorsTable users={pager.visible} currentUserId={p.currentUserId} loading={p.loading} onOpen={p.onOpen} skeletonRows={fit.rows} />}
      </div>
      {<HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="operadores" onPageChange={pager.setPage} />}
      {ready && <Footer users={p.users} />}
    </div>
  );
}
