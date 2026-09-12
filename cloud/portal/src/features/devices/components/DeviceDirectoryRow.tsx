import { Link } from 'react-router-dom';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import { CheckSquare, ChevronRight, Square } from 'lucide-react';
import { fmt } from '../../../shared/lib/formatters';
import TonerLevelBars from '../../../shared/components/TonerLevelBars';
import EstadoChip from '../../../shared/components/EstadoChip';
import { brandBadge, formatLastContact } from './deviceDirectoryFormat';
import { GRID_COLS } from './deviceDirectoryGrid';
import type { DeviceDirectoryEstado, DeviceDirectoryRow as Row } from '../types/deviceDirectory';

const ESTADO_LABEL: Record<DeviceDirectoryEstado, string> = {
  en_linea: 'EN LÍNEA', sin_contacto: 'SIN CONTACTO', dado_de_baja: 'DADO DE BAJA',
};

function SelectCheckbox({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="justify-self-start text-ink-300 hover:text-brand" aria-label={selected ? 'Quitar selección' : 'Seleccionar'}>
      {selected ? <CheckSquare size={14} className="text-brand" /> : <Square size={14} />}
    </button>
  );
}

/** Badge de marca + nombre + "MARCA — Modelo · S/N …" en una sola línea de metadata
 * (el mockup unifica lo que antes eran 3 líneas separadas). */
function DeviceIdentityCell({ row, returnParam }: { row: Row; returnParam: string }) {
  return (
    <Link to={`/devices/${row.id}?${returnParam}`} className="flex min-w-0 items-center gap-3">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[9px] font-bold text-ink-400">
        {brandBadge(row.brand)}
      </span>
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{row.name ?? row.model ?? 'Equipo'}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">{(row.brand ?? '—').toUpperCase()} — {row.model ?? 'S/M'} · S/N {row.serial_number ?? '—'}</div>
      </div>
    </Link>
  );
}

/** `null` en los 4 tóners = el equipo nunca reportó consumibles — nunca una celda
 * vacía, siempre "Sin lectura" (a diferencia de `TonerLevelBars` sola, que cae a
 * `SupplyLevelBar`/`—` cuando sólo falta el color, no cuando falta TODO). */
function ConsumiblesCell({ row }: { row: Row }) {
  const { toner_black, toner_cyan, toner_magenta, toner_yellow } = row;
  if (toner_black === null && toner_cyan === null && toner_magenta === null && toner_yellow === null) {
    return <span className="font-sans text-[12px] text-ink-200">Sin lectura</span>;
  }
  return <TonerLevelBars black={toner_black} cyan={toner_cyan} magenta={toner_magenta} yellow={toner_yellow} />;
}

function AlertsCell({ count }: { count: number }) {
  if (count === 0) return <div className="text-right font-montserrat text-[12.5px] font-semibold text-ink-200">—</div>;
  const cls = count >= 5 ? 'text-brand-severe' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{fmt(count)}</div>;
}

function ChevronLink({ id, returnParam }: { id: string; returnParam: string }) {
  return (
    <div className="flex justify-end">
      <Link to={`/devices/${id}?${returnParam}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out group-hover:border-line-300 group-hover:text-ink-100">
        <ChevronRight size={13} />
      </Link>
    </div>
  );
}

/** Una fila de equipo (handoff hifi "Inventario de dispositivos") — celdas chicas
 * separadas arriba para respetar el límite de 20 líneas/función de la guía. */
export default function DeviceDirectoryRow({ row, selected, onToggle }: { row: Row; selected: boolean; onToggle: () => void }) {
  const notReporting = row.estado !== 'en_linea';
  // `from`: la ficha vuelve al inventario con su filtro, orden y página.
  const returnParam = useReturnParam();
  const rowClass = `group grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover ${row.estado === 'dado_de_baja' ? 'opacity-60' : ''}`;
  return (
    <div data-fit-row className={rowClass}>
      <SelectCheckbox selected={selected} onToggle={onToggle} />
      <DeviceIdentityCell row={row} returnParam={returnParam} />
      <EstadoChip variant={row.estado === 'sin_contacto' ? 'attention' : 'neutral'} label={ESTADO_LABEL[row.estado]} />
      <div className="min-w-0 truncate font-mono text-[11.5px] text-ink-700">{row.ip_address ?? '—'}</div>
      <ConsumiblesCell row={row} />
      <div className="truncate font-sans text-[11.5px] text-ink-100">{row.agent_name ?? '—'}</div>
      <div className={`text-right font-sans text-[12px] ${notReporting ? 'text-brand-accent' : 'text-ink-400'}`}>{formatLastContact(row.last_seen)}</div>
      <AlertsCell count={row.alerts_count} />
      <ChevronLink id={row.id} returnParam={returnParam} />
    </div>
  );
}
