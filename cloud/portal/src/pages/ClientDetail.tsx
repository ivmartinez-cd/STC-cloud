import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  HardDrive, ChevronRight, Users, Radio,
  MapPin, Mail, BarChart2, Plus, Loader2, Trash2,
  Clock, Phone
} from 'lucide-react';
import { useClientDetail } from '../hooks/useClientDetail';
import { useToast } from '../context/ToastContext';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import ConfirmModal from '../components/ConfirmModal';
import ClientUsageChart from '../components/agents/ClientUsageChart';
import CreateMonitorModal from '../components/monitors/CreateMonitorModal';

function MonitorStatusBadge({ status, last_seen }: { status: string; last_seen: string | null }) {
  const isOnline = status === 'active'
    && last_seen !== null
    && (Date.now() - new Date(last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `hace ${hrs}h` : `hace ${Math.floor(hrs / 24)}d`;
}

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { client, monitors, usage, loading, error, createMonitor, deleteMonitor } = useClientDetail(id!);

  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [monitorToDelete, setMonitorToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  const handleDeleteMonitor = async () => {
    if (!monitorToDelete) return;
    setDeletingMonitor(true);
    try {
      await deleteMonitor(monitorToDelete.id);
      showToast(`Monitor ${monitorToDelete.name} eliminado`, 'success');
      setMonitorToDelete(null);
    } catch (err: unknown) {
      showToast('Error al eliminar monitor: ' + (err as Error).message, 'error');
    } finally {
      setDeletingMonitor(false);
    }
  };

  const onlineMonitors = monitors.filter(m =>
    m.status === 'active' && m.last_seen !== null
    && (Date.now() - new Date(m.last_seen).getTime() <= OFFLINE_THRESHOLD_MS)
  ).length;

  const totalPagesMonth = usage.length > 0
    ? usage[usage.length - 1].mono + usage[usage.length - 1].color
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/clients" className="flex items-center gap-2 text-slate-400 hover:text-brand font-bold uppercase tracking-widest transition-colors">
          <Users size={14} /> Clientes
        </Link>
        <ChevronRight size={14} className="text-slate-300" />
        {client ? (
          <span className="text-brand font-extrabold uppercase tracking-widest">{client.name}</span>
        ) : (
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded-full" />
        )}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-brand" size={40} />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">Cargando expediente del cliente...</p>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-8 text-rose-600 font-bold animate-in shake">
          {error}
        </div>
      )}

      {!loading && !error && client && (
        <>
          {/* Header Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Metrics */}
            <div className="flex flex-col gap-4">
              <div className="cd-panel p-5 border-l-4 border-l-brand flex items-center gap-5">
                <div className="p-3 bg-blue-50 text-brand rounded-2xl"><HardDrive size={24} /></div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{client.device_count}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Dispositivos</div>
                </div>
              </div>
              <div className="cd-panel p-5 border-l-4 border-l-emerald-500 flex items-center gap-5">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Radio size={24} /></div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{monitors.length}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Monitores — <span className="text-emerald-500">{onlineMonitors} activos</span>
                  </div>
                </div>
              </div>
              <div className="cd-panel p-5 border-l-4 border-l-amber-500 flex items-center gap-5">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><BarChart2 size={24} /></div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{totalPagesMonth.toLocaleString()}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Páginas este mes</div>
                </div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="cd-panel p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-16 h-16 bg-blue-50 text-brand rounded-2xl flex items-center justify-center shadow-sm">
                    <Users size={32} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-[#1a2333] tracking-tight">{client.name}</h1>
                    <span className="text-[10px] font-extrabold text-brand uppercase tracking-[0.2em]">Perfil Corporativo</span>
                  </div>
                </div>
                <div className="space-y-4">
                  {client.contact_name && (
                    <div className="flex items-center gap-4 group">
                      <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-50 group-hover:text-brand transition-colors">
                        <Users size={16} />
                      </div>
                      <span className="font-bold text-sm text-[#1a2333]">{client.contact_name}</span>
                    </div>
                  )}
                  {client.contact_email && (
                    <div className="flex items-center gap-4 group">
                      <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-50 group-hover:text-brand transition-colors">
                        <Mail size={16} />
                      </div>
                      <span className="text-sm text-slate-600 truncate font-medium">{client.contact_email}</span>
                    </div>
                  )}
                  {client.contact_phone && (
                    <div className="flex items-center gap-4 group">
                      <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-50 group-hover:text-brand transition-colors">
                        <Phone size={16} />
                      </div>
                      <span className="text-sm text-slate-600 font-medium">{client.contact_phone}</span>
                    </div>
                  )}
                  {(client.address || client.country) && (
                    <div className="flex items-center gap-4 group">
                      <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-50 group-hover:text-brand transition-colors">
                        <MapPin size={16} />
                      </div>
                      <span className="text-xs text-slate-500 font-medium leading-tight">
                        {[client.address, client.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Usage Chart */}
            <ClientUsageChart usage={usage} />
          </div>

          {/* Monitor List */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-4">
                <div className="p-2 bg-blue-50 text-brand rounded-xl shadow-sm"><Radio size={20} /></div>
                Infraestructura de Monitoreo
                <span className="ml-2 px-2.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-extrabold rounded-full tracking-widest">
                  {monitors.length} NODOS
                </span>
              </h2>
              <button
                onClick={() => setShowMonitorModal(true)}
                className="bg-brand hover:bg-[#2471a3] text-white px-6 py-3 rounded-2xl flex items-center gap-3 text-sm font-extrabold shadow-lg shadow-blue-900/10 transition-all active:scale-95 group"
              >
                <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                Registrar Nuevo Monitor
              </button>
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
                            <div className="p-3 bg-slate-50 rounded-2xl group-hover/m:bg-blue-50 transition-colors">
                              <Radio size={16} className="text-slate-400 group-hover/m:text-brand" />
                            </div>
                            <div>
                              <p className="font-extrabold text-[#1a2333] group-hover/m:text-brand transition-colors">{m.name}</p>
                              {m.host_name && <p className="text-[10px] font-bold text-slate-400 tracking-tighter font-mono">{m.host_name}</p>}
                            </div>
                          </Link>
                        </td>
                        <td><MonitorStatusBadge status={m.status} last_seen={m.last_seen} /></td>
                        <td className="hidden md:table-cell">
                          <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                            <Clock size={12} className="text-slate-300" /> {timeAgo(m.last_seen)}
                          </div>
                        </td>
                        <td className="text-center">
                          <Link to={`/monitors/${m.id}?tab=devices`}
                            className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-2xl bg-slate-100 text-sm font-black text-brand hover:bg-brand hover:text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all active:scale-90">
                            {m.device_count}
                          </Link>
                        </td>
                        <td className="hidden lg:table-cell">
                          <span className="text-[10px] font-extrabold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            CADA {m.scan_interval_minutes} MIN
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => setMonitorToDelete({ id: m.id, name: m.name })}
                            className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all active:scale-90"
                            title="Eliminar Monitor"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <CreateMonitorModal
        isOpen={showMonitorModal}
        onClose={() => setShowMonitorModal(false)}
        onCreate={createMonitor}
      />

      <ConfirmModal
        isOpen={!!monitorToDelete}
        onClose={() => setMonitorToDelete(null)}
        onConfirm={handleDeleteMonitor}
        isLoading={deletingMonitor}
        isDanger
        title="Eliminar Nodo de Monitoreo"
        message={`Esta acción desactivará permanentemente el agente "${monitorToDelete?.name}". Se perderá la comunicación con todos los dispositivos asociados a este nodo.`}
        confirmText="Confirmar Eliminación"
      />
    </div>
  );
};

export default ClientDetail;
