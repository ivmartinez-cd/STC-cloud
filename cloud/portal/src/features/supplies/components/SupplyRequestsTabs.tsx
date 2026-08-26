import SegmentChips from '../../../shared/components/SegmentChips';
import { SUPPLY_REQUEST_STATUS_LABELS } from '../types/supplyRequests';
import { TABS, type RequestTab } from '../hooks/useSupplyRequestsPage';

interface Props {
  active: RequestTab;
  onChange: (t: RequestTab) => void;
  countOf: (t: RequestTab) => number;
}

/** Tabs → chips de segmento con contador (handoff hifi #3, fase 3, 26/08/2026)
 * — reusa `shared/SegmentChips` (selección única, cada pedido tiene un solo
 * estado a la vez). */
export default function SupplyRequestsTabs({ active, onChange, countOf }: Props) {
  const options = TABS.map((t) => ({ value: t, label: t === 'all' ? 'TODAS' : SUPPLY_REQUEST_STATUS_LABELS[t].toUpperCase(), count: countOf(t) }));
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-150 px-5 py-[13px]">
      <SegmentChips options={options} active={active} onChange={onChange} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por apertura · desc</div>
    </div>
  );
}
