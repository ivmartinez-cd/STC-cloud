import SearchInput from '../../../shared/components/SearchInput';
import { URGENCY_LABELS } from '../lib/suppliesPresentation';
import type { ClientOption, UrgencyFilter } from '../hooks/useSuppliesPage';
import type { SupplyKind } from '../../../shared/types/supplies';

const KINDS: SupplyKind[] = ['Tóner', 'Tambor de imagen', 'Fusor', 'Rodillo', 'Banda de transferencia', 'Depósito de residuos', 'Kit de mantenimiento', 'Otro'];
const SELECT = 'min-w-[150px] rounded-[3px] border border-line-100 bg-white px-3 py-[9px] font-sans text-[12px] font-semibold text-ink-600 outline-none focus:border-brand';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  clientId: string;
  onClientIdChange: (v: string) => void;
  canFilterByClient: boolean;
  clients: ClientOption[];
  kind: SupplyKind | '';
  onKindChange: (v: SupplyKind | '') => void;
  urgency: UrgencyFilter;
  onUrgencyChange: (v: UrgencyFilter) => void;
}

function ClientSelect({ p }: { p: Props }) {
  if (!p.canFilterByClient) return null;
  return (
    <select value={p.clientId} onChange={(e) => p.onClientIdChange(e.target.value)} className={SELECT}>
      <option value="">Todos los clientes</option>
      {p.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function KindAndUrgencySelects({ p }: { p: Props }) {
  return (
    <>
      <select value={p.kind} onChange={(e) => p.onKindChange(e.target.value as SupplyKind | '')} className={SELECT}>
        <option value="">Todo tipo</option>
        {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <select value={p.urgency} onChange={(e) => p.onUrgencyChange(e.target.value as UrgencyFilter)} className={SELECT}>
        <option value="">Cualquier urgencia</option>
        {Object.entries(URGENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </>
  );
}

/** Handoff hifi #3, fase 3, 26/08/2026 — a diferencia de Alertas/Correo, acá
 * los 3 filtros SIGUEN siendo `<select>` (README punto 9: "los tres select
 * nativos... pasan a controles del sistema", no a chips). */
export default function SuppliesFilterBar(p: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput value={p.query} onChange={p.onQueryChange} placeholder="Buscar por SKU, serie, modelo o cliente…" className="max-w-[400px]" />
      <ClientSelect p={p} />
      <KindAndUrgencySelects p={p} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por nivel · asc</div>
    </div>
  );
}
