import { Radio, Plus, Clock, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OFFLINE_THRESHOLD_MS } from '../../lib/constants';
import type { Monitor } from '../../types/monitor';

function MonitorStatusBadge({ status, last_seen, now }: { status: string; last_seen: string | null; now: number }) {
  const isOnline = status === 'active'
    && last_seen !== null
    && (now - new Date(last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

  if (status === 'active' && isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
      </span>
    );
  }
  if (status === 'active' && !isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Sin Contacto
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {status === 'pending' ? 'Pendiente' : 'Offline'}
    </span>
  );
}

function timeAgo(dateStr: string | null, now: number): string {
  if (!dateStr) return 'Nunca';
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `hace ${hrs}h` : `hace ${Math.floor(hrs / 24)}d`;
}

export default function ClientMonitorsSection({
  monitors,
  now,
  isReadOnlyViewer,
  onCreateClick,
  onDeleteClick,
}: {
  monitors: Monitor[];
  now: number;
  isReadOnlyViewer: boolean;
  onCreateClick: () => void;
  onDeleteClick: (monitor: { id: string; name: string }) => void;
}) {
  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-4">
          <div className="p-2 bg-brand/10 text-brand rounded-xl shadow-sm"><Radio size={20} /></div>
          Infraestructura de Monitoreo
          <span className="ml-2 px-2.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-extrabold rounded-full tracking-widest">
            {monitors.length} NODOS
          </span>
        </h2>
        {!isReadOnlyViewer && (
          <button
            onClick={onCreateClick}
            className="bg-brand hover:bg-brand-hover text-white px-6 py-3 rounded-2xl flex items-center gap-3 text-sm font-extrabold shadow-lg shadow-brand/10 transition-all active:scale-95 group"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            Registrar Nuevo Monitor
          </button>
        )}
      </div>

      <div className="cd-panel overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
        {monitors.length === 0 ? (
          <div className="text-center py-24 bg-white">
            <Radio size={64} className="mx-auto mb-6 text-slate-50" />
            <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">Sin monitores configurados</p>
          </div>
        ) : (
          <table className="cd-table">
            <thead>
              <tr>
                <th>Identificador del Nodo</th>
                <th>Estado</th>
                <th className="hidden md:table-cell">Última Actividad</th>
                <th className="text-center">Dispositivos</th>
                <th className="hidden lg:table-cell">Intervalo</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                  <td>
                    <Link to={`/monitors/${m.id}`} className="flex items-center gap-4 group/m">
                      <div className="p-3 bg-slate-50 rounded-2xl group-hover/m:bg-brand/10 transition-colors">
                        <Radio size={16} className="text-slate-400 group-hover/m:text-brand" />
                      </div>
                      <div>
                        <p className="font-extrabold text-[#1a2333] group-hover/m:text-brand transition-colors">{m.name}</p>
                        {m.host_name && <p className="text-[10px] font-bold text-slate-400 tracking-tighter font-mono">{m.host_name}</p>}
                      </div>
                    </Link>
                  </td>
                  <td><MonitorStatusBadge status={m.status} last_seen={m.last_seen} now={now} /></td>
                  <td className="hidden md:table-cell">
                    <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                      <Clock size={12} className="text-slate-400" /> {timeAgo(m.last_seen, now)}
                    </div>
                  </td>
                  <td className="text-center">
                    <Link to={`/monitors/${m.id}?tab=devices`}
                      className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-2xl bg-slate-100 text-sm font-black text-brand hover:bg-brand hover:text-white hover:shadow-lg hover:shadow-brand/20 transition-all active:scale-90">
                      {m.device_count}
                    </Link>
                  </td>
                  <td className="text-right">
                    {!isReadOnlyViewer && (
                      <button
                        onClick={() => onDeleteClick({ id: m.id, name: m.name })}
                        className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all active:scale-90"
                        title="Eliminar Monitor"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
