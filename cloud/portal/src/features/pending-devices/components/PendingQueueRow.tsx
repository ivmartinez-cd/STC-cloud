import { CheckSquare, Square } from 'lucide-react';
import EstadoChip from '../../../shared/components/EstadoChip';
import { ACTION_LABEL, REVISION_LABEL, REVISION_VARIANT, brandBadge, formatWait } from './pendingQueueFormat';
import { GRID_COLS } from './pendingQueueGrid';
import type { PendingQueueRow as Row } from '../types/pendingDevices';

function SelectCheckbox({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="justify-self-start text-ink-300 hover:text-brand" aria-label={selected ? 'Quitar selección' : 'Seleccionar'}>
      {selected ? <CheckSquare size={14} className="text-brand" /> : <Square size={14} />}
    </button>
  );
}

function DeviceIdentityCell({ row }: { row: Row }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[9px] font-bold text-ink-400">
        {brandBadge(row.brand)}
      </span>
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{row.name ?? row.model ?? 'Equipo'}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">S/N {row.serial_number ?? '—'} · host {row.hostname ?? '—'}</div>
      </div>
    </div>
  );
}

function ClientSuggestedCell({ row }: { row: Row }) {
  if (!row.client_name) return <span className="truncate font-sans text-[12px] text-ink-200">Sin cliente asignado</span>;
  return <span className="truncate font-sans text-[12px] text-ink-700">{row.client_name}</span>;
}

function WaitCell({ row }: { row: Row }) {
  const cls = row.wait_days >= 7 ? 'text-brand-severe' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{formatWait(row.wait_days, row.created_at)}</div>;
}

function ActionCell({ row, onAction }: { row: Row; onAction: (row: Row) => void }) {
  return (
    <div className="text-right">
      <button
        type="button" onClick={() => onAction(row)}
        className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        {ACTION_LABEL[row.revision]}
      </button>
    </div>
  );
}

interface Props { row: Row; selected: boolean; onToggle: () => void; onAction: (row: Row) => void }

/** Una fila del equipo descubierto (handoff hifi "Dispositivos pendientes",
 * 25/08/2026) — celdas chicas separadas arriba por el límite de 20 líneas/función. */
export default function PendingQueueRow({ row, selected, onToggle, onAction }: Props) {
  return (
    <div data-fit-row className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
      <SelectCheckbox selected={selected} onToggle={onToggle} />
      <DeviceIdentityCell row={row} />
      <ClientSuggestedCell row={row} />
      <div className="min-w-0 truncate font-mono text-[11.5px] text-ink-700">{row.ip_address ?? '—'}</div>
      <div className="truncate font-sans text-[11.5px] text-ink-100">{row.agent_name ?? '—'}</div>
      <EstadoChip variant={REVISION_VARIANT[row.revision]} label={REVISION_LABEL[row.revision]} />
      <WaitCell row={row} />
      <ActionCell row={row} onAction={onAction} />
    </div>
  );
}
