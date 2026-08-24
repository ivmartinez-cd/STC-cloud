import { Link } from 'react-router-dom';
import { RefreshCw, Pencil, Archive, ArchiveRestore, ArrowRightLeft, GitMerge, Trash2 } from 'lucide-react';
import { MONITOR_STATE_LABELS, type MonitorState } from '../../../lib/constants';
import type { DeviceDetailData } from '../../../types/deviceDetailPage';

export default function DeviceDetailHeader({
  device,
  role,
  loading,
  changingMonitorState,
  recommissioning,
  onRefresh,
  onMonitorStateChange,
  onEdit,
  onMove,
  onMerge,
  onRecommission,
  onDecommission,
  onDelete,
}: {
  device: DeviceDetailData | null;
  role: string;
  loading: boolean;
  changingMonitorState: boolean;
  recommissioning: boolean;
  onRefresh: () => void;
  onMonitorStateChange: (state: string) => void;
  onEdit: () => void;
  onMove: () => void;
  onMerge: () => void;
  onRecommission: () => void;
  onDecommission: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 px-6 rounded-2xl border border-slate-100 shadow-xs text-xs font-bold text-slate-500">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/" className="text-slate-400 hover:text-brand transition-colors hover:underline">Canal Directo</Link>
        <span className="text-slate-300">›</span>
        {device?.client_id ? <Link to={`/clients/${device.client_id}`} className="text-slate-600 hover:text-brand hover:underline">{device.client_name || 'Cliente'}</Link> : <span className="text-slate-600">{device?.client_name || 'Cliente'}</span>}
        <span className="text-slate-300">›</span>
        {device?.agent_id ? <Link to={`/monitors/${device.agent_id}`} className="text-slate-600 hover:text-brand hover:underline">{device.monitor_name || 'Monitor'}</Link> : <span className="text-slate-600">{device?.monitor_name || 'Monitor'}</span>}
        <span className="text-slate-300">›</span>
        <span className="bg-slate-100 text-slate-800 font-extrabold px-2.5 py-1 rounded-lg">{device?.serial_number || device?.ip_address || 'Dispositivo'}</span>
      </div>
      <div className="flex items-center gap-3">
        {device && role !== 'client_viewer' && !device.merged_into && (
          <>
            <select
              value={device.monitor_state ?? 'full'}
              onChange={(e) => onMonitorStateChange(e.target.value)}
              disabled={changingMonitorState}
              title="Estado de monitoreo"
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {(Object.keys(MONITOR_STATE_LABELS) as MonitorState[]).map((s) => (
                <option key={s} value={s}>{MONITOR_STATE_LABELS[s]}</option>
              ))}
            </select>
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all">
              <Pencil size={14} /> Editar
            </button>
            <button onClick={onMove} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all">
              <ArrowRightLeft size={14} /> Mover
            </button>
            <button onClick={onMerge} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all">
              <GitMerge size={14} /> Fusionar
            </button>
            {device.decommissioned_at ? (
              <button onClick={onRecommission} disabled={recommissioning} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50">
                <ArchiveRestore size={14} /> Reactivar
              </button>
            ) : (
              <button onClick={onDecommission} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl border border-amber-200 text-xs font-bold transition-all">
                <Archive size={14} /> Dar de baja
              </button>
            )}
          </>
        )}
        {device && role !== 'client_viewer' && (
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 text-xs font-bold transition-all">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
        <button onClick={onRefresh} disabled={loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all disabled:opacity-40" title="Actualizar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
