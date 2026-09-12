import { Link } from 'react-router-dom';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import { CheckSquare, ChevronRight, Square } from 'lucide-react';
import BrandBadge from '../../../shared/components/BrandBadge';
import EstadoChip from '../../../shared/components/EstadoChip';
import SupplyLevelBar from '../../../shared/components/SupplyLevelBar';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { fmt } from '../../../shared/lib/formatters';
import { SWATCH_HEX, URGENCY_LABELS, urgencyChipProps } from '../lib/suppliesPresentation';
import type { FleetSupplyRow } from '../../../shared/types/supplies';
import { GRID_COLS } from './suppliesGrid';

const HEAD_LABELS = ['EQUIPO Y SEDE', 'CLIENTE', 'CONSUMIBLE', 'NIVEL RESTANTE ↑'];

type Selection = { selected: Set<string>; allSelected: boolean; toggle: (id: string) => void; toggleAll: () => void };

function EquipmentCell({ r }: { r: FleetSupplyRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandBadge brand={r.device_brand} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{r.device_model || 'Equipo'}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">{r.agent_name ?? 'Sin sede'} · S/N {r.device_serial ?? '—'}</div>
      </div>
    </div>
  );
}

function ConsumibleCell({ r }: { r: FleetSupplyRow }) {
  return (
    <div className="flex min-w-0 items-center gap-[9px]">
      <span className="block h-[10px] w-[10px] shrink-0 rounded-[2px] border border-line-avatar" style={{ background: SWATCH_HEX[r.color] }} />
      <span className="truncate font-sans text-[12px] text-ink-700">{r.description}</span>
    </div>
  );
}

function SelectCell({ r, readOnly, selection, rowKey }: { r: FleetSupplyRow; readOnly: boolean; selection: Selection; rowKey: (r: FleetSupplyRow) => string }) {
  if (readOnly) return <span />;
  const key = rowKey(r);
  return (
    <button type="button" onClick={() => selection.toggle(key)} className="justify-self-start text-ink-300 hover:text-ink-100" title="Seleccionar">
      {selection.selected.has(key) ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} />}
    </button>
  );
}

function DetailLinkCell({ deviceId }: { deviceId: string | null }) {
  // `from`: la ficha vuelve a Consumibles con el filtro y la página puestos.
  const returnParam = useReturnParam();
  if (!deviceId) return <span />;
  return <Link to={`/devices/${deviceId}?${returnParam}`} className="justify-self-end text-ink-300 hover:text-ink-100"><ChevronRight size={15} /></Link>;
}

function Row({ r, readOnly, selection, rowKey }: { r: FleetSupplyRow; readOnly: boolean; selection: Selection; rowKey: (r: FleetSupplyRow) => string }) {
  const chip = urgencyChipProps(r.urgency);
  return (
    <div data-fit-row className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
      <SelectCell r={r} readOnly={readOnly} selection={selection} rowKey={rowKey} />
      <EquipmentCell r={r} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{r.client_name ?? '—'}</span>
      <ConsumibleCell r={r} />
      <SupplyLevelBar pct={r.percentage} />
      <span className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-600">{r.remainingPages != null ? fmt(r.remainingPages) : '—'}</span>
      <span className="justify-self-start"><EstadoChip label={URGENCY_LABELS[r.urgency]} variant={chip.variant} dotClassName={chip.dotClassName} /></span>
      <span className="truncate font-mono text-[11.5px] text-ink-300">{r.code || 'Sin SKU'}</span>
      <DetailLinkCell deviceId={r.device_id} />
    </div>
  );
}

function HeaderRow({ readOnly, selection }: { readOnly: boolean; selection: Selection }) {
  return (
    <div data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      {readOnly ? <span /> : (
        <button type="button" onClick={selection.toggleAll} className="justify-self-start text-ink-300 hover:text-ink-100" title="Seleccionar todos">
          {selection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
      )}
      {HEAD_LABELS.map((l) => <div key={l} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{l}</div>)}
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">PÁG. RESTANTES</div>
      <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">URGENCIA</div>
      <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">SKU</div>
      <div />
    </div>
  );
}

const SKELETON_WIDTHS = ['', 'w-3/5', 'w-2/5', 'w-1/2', 'w-3/5', 'w-2/5', 'w-2/5', 'w-2/5', ''];

interface Props {
  items: FleetSupplyRow[];
  readOnly: boolean;
  selection: Selection;
  rowKey: (r: FleetSupplyRow) => string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  skeletonRows?: number;
}

/** Tabla de Consumibles (handoff hifi #3, fase 3, 26/08/2026): NIVEL RESTANTE
 * como barra + %, PÁG. RESTANTES y URGENCIA como columnas nuevas (antes la
 * pantalla no tenía ningún agregado por fila más allá del %). */
export default function SuppliesTable({ items, readOnly, selection, rowKey, loading, error, onRetry, skeletonRows = 8 }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1300px]" role="table" aria-label="Consumibles">
        <HeaderRow readOnly={readOnly} selection={selection} />
        {error ? (
          <TableErrorState message="No se pudo cargar" onRetry={onRetry} />
        ) : loading ? (
          Array.from({ length: skeletonRows }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={SKELETON_WIDTHS} />)
        ) : items.length === 0 ? (
          <TableEmptyState message="Ningún consumible con los filtros actuales" />
        ) : (
          items.map((r) => <Row key={rowKey(r)} r={r} readOnly={readOnly} selection={selection} rowKey={rowKey} />)
        )}
      </div>
    </div>
  );
}
