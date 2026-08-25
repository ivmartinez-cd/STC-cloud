import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { formatRelativeTime, getDeviceStatusInfo } from '../../../../shared/lib/formatters';
import { MONITOR_STATE_LABELS, type MonitorState } from '../../../../shared/lib/constants';
import EstadoChip from '../../../../shared/components/EstadoChip';
import type { DeviceDetailData } from '../../types/deviceDetailPage';

const ACTION_BASE = 'rounded-[3px] px-[15px] py-[10px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

function initialsOf(model: string | null, brand: string | null): string {
  const source = (brand ?? model ?? '?').trim();
  return source.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
}

/** Menú de desborde: acciones de ciclo de vida que el handoff no dibuja en el
 * header simplificado (Editar, Fusionar, Dar de baja, Eliminar, estado de
 * monitoreo) — no se pierden, sólo bajan de jerarquía visual. `ELIMINAR` en
 * variante advertencia, nunca rojo relleno (transversal #1). */
function OverflowMenu({ device, changingMonitorState, recommissioning, onMonitorStateChange, onEdit, onMerge, onRecommission, onDecommission, onDelete }: {
  device: DeviceDetailData; changingMonitorState: boolean; recommissioning: boolean;
  onMonitorStateChange: (state: string) => void; onEdit: () => void; onMerge: () => void;
  onRecommission: () => void; onDecommission: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={`${ACTION_BASE} border border-line-300 bg-white p-[10px] text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`} aria-label="Más acciones">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-60 rounded-[5px] border border-line-100 bg-white py-1.5" onMouseLeave={() => setOpen(false)}>
          <select value={device.monitor_state ?? 'full'} disabled={changingMonitorState} onChange={(e) => onMonitorStateChange(e.target.value)}
            className="mx-2 mb-1.5 w-[calc(100%-16px)] rounded-[3px] border border-line-300 bg-white px-2 py-1.5 font-sans text-[12px] text-ink-700">
            {(Object.keys(MONITOR_STATE_LABELS) as MonitorState[]).map((s) => <option key={s} value={s}>{MONITOR_STATE_LABELS[s]}</option>)}
          </select>
          <button type="button" onClick={onEdit} className="block w-full px-4 py-2 text-left font-sans text-[12.5px] text-ink-700 hover:bg-surface-btn-hover">Editar</button>
          <button type="button" onClick={onMerge} className="block w-full px-4 py-2 text-left font-sans text-[12.5px] text-ink-700 hover:bg-surface-btn-hover">Fusionar</button>
          {device.decommissioned_at
            ? <button type="button" onClick={onRecommission} disabled={recommissioning} className="block w-full px-4 py-2 text-left font-sans text-[12.5px] text-ink-700 hover:bg-surface-btn-hover">Reactivar</button>
            : <button type="button" onClick={onDecommission} className="block w-full px-4 py-2 text-left font-sans text-[12.5px] text-ink-700 hover:bg-surface-btn-hover">Dar de baja</button>}
          <button type="button" onClick={onDelete} className="block w-full px-4 py-2 text-left font-sans text-[12.5px] text-brand-accent hover:bg-brand-soft">Eliminar</button>
        </div>
      )}
    </div>
  );
}

interface Props {
  device: DeviceDetailData;
  now: number;
  isReadOnlyViewer: boolean;
  alertsOpen: number;
  syncing: boolean;
  requestingSupply: boolean;
  changingMonitorState: boolean;
  recommissioning: boolean;
  onSync: () => void;
  onRequestSupply: () => void;
  onOpenHistory: () => void;
  onMove: () => void;
  onEdit: () => void;
  onMerge: () => void;
  onRecommission: () => void;
  onDecommission: () => void;
  onDelete: () => void;
  onMonitorStateChange: (state: string) => void;
}

export default function DeviceProfileCard({
  device, now, isReadOnlyViewer, alertsOpen, syncing, requestingSupply,
  changingMonitorState, recommissioning, onSync, onRequestSupply, onOpenHistory, onMove,
  onEdit, onMerge, onRecommission, onDecommission, onDelete, onMonitorStateChange,
}: Props) {
  const status = getDeviceStatusInfo(device.last_seen, now);
  const metaParts = [
    device.serial_number ? `Serie ${device.serial_number}` : null,
    device.ip_address,
    [device.location, device.monitor_name].filter(Boolean).join(' · ') || null,
    device.last_seen ? `Último reporte ${formatRelativeTime(device.last_seen, now).toLowerCase()}` : null,
  ].filter((p): p is string => !!p);

  return (
    <div className="flex flex-wrap items-start justify-between gap-5 px-6 pb-5 pt-[22px]">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] border border-line-avatar bg-surface-avatar font-montserrat text-[13px] font-bold text-ink-100">
          {initialsOf(device.model, device.brand)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[11px]">
            <h1 className="m-0 font-montserrat text-[27px] font-extrabold leading-[1.1] tracking-[-.015em] text-ink-900">{device.model ?? device.name ?? 'Dispositivo'}</h1>
            <EstadoChip variant={status.status === 'online' ? 'neutral' : 'attention'} label={status.status === 'online' ? 'EN LÍNEA' : status.label.toUpperCase()} />
            <EstadoChip variant={alertsOpen > 0 ? 'attention' : 'neutral'} label={alertsOpen > 0 ? `${alertsOpen} ALERTA${alertsOpen === 1 ? '' : 'S'} ABIERTA${alertsOpen === 1 ? '' : 'S'}` : 'SIN ALERTAS ABIERTAS'} />
          </div>
          <div className="mt-[9px] flex flex-wrap items-center gap-2.5 font-sans text-[12.5px] leading-snug text-ink-400">
            {metaParts.map((part, i) => (
              <span key={i} className="flex items-center gap-2.5">{i > 0 && <span className="text-ink-sep">·</span>}{part}</span>
            ))}
          </div>
        </div>
      </div>

      {!isReadOnlyViewer && (
        <div className="flex flex-wrap items-center gap-[9px]">
          <button type="button" onClick={onOpenHistory} className={`${ACTION_BASE} border border-line-300 bg-white text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`}>Historial</button>
          <button type="button" onClick={onMove} className={`${ACTION_BASE} border border-line-300 bg-white text-ink-600 hover:border-line-hover hover:bg-surface-btn-hover`}>Mover de sitio</button>
          <button type="button" onClick={onRequestSupply} disabled={requestingSupply} className={`${ACTION_BASE} border border-brand-chip-border bg-brand-soft text-brand-accent hover:bg-[var(--color-brand-warn-hover)] disabled:opacity-70`}>
            {requestingSupply ? 'Pidiendo…' : 'Pedir consumible'}
          </button>
          <button type="button" onClick={onSync} disabled={syncing} className={`${ACTION_BASE} bg-brand text-white hover:bg-brand-severe disabled:cursor-default disabled:opacity-70`}>
            {syncing ? 'Actualizando…' : 'Actualizar lectura'}
          </button>
          <OverflowMenu
            device={device} changingMonitorState={changingMonitorState} recommissioning={recommissioning}
            onMonitorStateChange={onMonitorStateChange} onEdit={onEdit} onMerge={onMerge}
            onRecommission={onRecommission} onDecommission={onDecommission} onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}
