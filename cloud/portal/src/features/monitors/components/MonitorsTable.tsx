import { ShieldCheck, ShieldOff, RefreshCw, Settings, Trash2, Radio, Server, Activity, Loader2 } from 'lucide-react';
import type { MonitorListItem } from '../types/monitorsPage';

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Nunca';
  const lastSeenDate = new Date(ts);
  const diffMs = Date.now() - lastSeenDate.getTime();
  const min = Math.floor(diffMs / 60000);

  if (min < 2) return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.floor(min / 60)} horas`;
  return lastSeenDate.toLocaleDateString();
}

export default function MonitorsTable({
  monitors,
  loading,
  revoking,
  onConfigure,
  onRevoke,
  onDeleteClick,
}: {
  monitors: MonitorListItem[];
  loading: boolean;
  revoking: string | null;
  onConfigure: (monitor: MonitorListItem) => void;
  onRevoke: (id: string) => void;
  onDeleteClick: (monitor: MonitorListItem) => void;
}) {
  return (
    <div className="cd-panel border-slate-200">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-extrabold text-[#1a2333] tracking-tight">Monitores Registrados</h3>
        <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
          {monitors.length} Total
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 size={32} className="animate-spin text-brand" />
          <span className="text-sm font-bold uppercase tracking-widest opacity-50">Sincronizando agentes...</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm cd-table border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-[0.15em]">
                <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Nombre / Sucursal</th>
                <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Hardware ID</th>
                <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Última Conexión</th>
                <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Estado</th>
                <th className="px-6 py-4 text-right font-bold border-b border-slate-100">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {monitors.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Server size={48} />
                      <p className="font-bold uppercase tracking-widest text-xs">No hay monitores activos</p>
                    </div>
                  </td>
                </tr>
              )}
              {monitors.map(monitor => (
                <tr key={monitor.id} className="hover:bg-brand/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        monitor.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Radio size={14} />
                      </div>
                      <span className="font-bold text-[#1a2333]">{monitor.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      {monitor.hardware_id || 'SIN_VINCULAR'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Activity size={12} className="opacity-40" />
                      <span className="text-xs font-medium">{formatLastSeen(monitor.last_seen)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {monitor.status === 'active' && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                        <ShieldCheck size={12} /> Operativo
                      </span>
                    )}
                    {monitor.status === 'revoked' && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                        <ShieldOff size={12} /> Revocado
                      </span>
                    )}
                    {monitor.status === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                        <RefreshCw size={12} className="animate-spin-slow" /> Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {monitor.status !== 'revoked' && (
                        <button
                          onClick={() => onConfigure(monitor)}
                          className="p-2 text-brand hover:bg-brand hover:text-white rounded-lg transition-all"
                          title="Configurar"
                        >
                          <Settings size={16} />
                        </button>
                      )}
                      {monitor.status === 'active' && (
                        <button
                          onClick={() => onRevoke(monitor.id)}
                          disabled={revoking === monitor.id}
                          className="p-2 text-orange-500 hover:bg-orange-500 hover:text-white rounded-lg transition-all"
                          title="Revocar acceso"
                        >
                          {revoking === monitor.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteClick(monitor)}
                        className="p-2 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                        title="Eliminar permanentemente"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
