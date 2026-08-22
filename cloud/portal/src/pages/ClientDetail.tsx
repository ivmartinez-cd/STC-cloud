import { useState, useCallback, useEffect } from 'react';
import { useNow } from '../hooks/useNow';
import { useParams, Link } from 'react-router-dom';
import {
  HardDrive, ChevronRight, Users, Radio,
  MapPin, Mail, BarChart2, Plus, Loader2, Trash2,
  Clock, Phone, Bell, Webhook, Edit2, Save, X
} from 'lucide-react';
import { useClientDetail } from '../hooks/useClientDetail';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import ConfirmModal from '../components/ConfirmModal';
import ClientUsageChart from '../components/agents/ClientUsageChart';
import CreateMonitorModal from '../components/monitors/CreateMonitorModal';
import { MergeDeviceModal } from '../components/devices/DeviceLifecycleModals';
import { api } from '../lib/api';

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

/**
 * Canales de notificación por cliente (email + webhook para alertas críticas).
 * No existía ningún formulario de edición de cliente antes de esto — la única
 * escritura era `createClient`. Sólo admin/operator: `PUT /clients/:id` no está en
 * el allowlist de RBAC para client_viewer.
 */
function NotificationSettingsCard({
  email, webhookUrl, canEdit, onSave,
}: {
  email: string | null;
  webhookUrl: string | null;
  canEdit: boolean;
  onSave: (fields: { notification_email: string; notification_webhook_url: string }) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [emailInput, setEmailInput] = useState(email ?? '');
  const [webhookInput, setWebhookInput] = useState(webhookUrl ?? '');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setEmailInput(email ?? '');
    setWebhookInput(webhookUrl ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ notification_email: emailInput.trim(), notification_webhook_url: webhookInput.trim() });
      showToast('Canales de notificación actualizados', 'success');
      setEditing(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-brand rounded-xl"><Bell size={18} /></div>
          Notificaciones de Alertas
        </h3>
        {canEdit && !editing && (
          <button onClick={startEditing} className="p-2 text-slate-400 hover:text-brand hover:bg-blue-50 rounded-xl transition-all">
            <Edit2 size={16} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Email para alertas críticas</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                placeholder="alertas@cliente.com"
                className="cd-input w-full !pl-9 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Webhook (https)</label>
            <div className="relative">
              <Webhook size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="text" value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://..."
                className="cd-input w-full !pl-9 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand hover:bg-[#2471a3] text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4 group">
            <div className="p-2 bg-slate-50 text-slate-400 rounded-xl"><Mail size={16} /></div>
            <span className={`text-sm font-medium ${email ? 'text-slate-600' : 'text-slate-300 italic'}`}>
              {email || 'Sin configurar'}
            </span>
          </div>
          <div className="flex items-center gap-4 group">
            <div className="p-2 bg-slate-50 text-slate-400 rounded-xl"><Webhook size={16} /></div>
            <span className={`text-sm font-mono truncate ${webhookUrl ? 'text-slate-600' : 'text-slate-300 italic font-sans'}`}>
              {webhookUrl || 'Sin configurar'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface DuplicateCandidate {
  a_id: string; a_serial: string | null; a_mac: string | null; a_ip: string | null;
  b_id: string; b_serial: string | null; b_mac: string | null; b_ip: string | null;
  reason: string;
}

const DUPLICATE_REASON_LABEL: Record<string, string> = {
  same_mac: 'misma MAC',
  ghost_same_ip: 'fantasma en la misma IP',
  same_serial_different_monitor: 'mismo serial en dos monitores',
  same_hostname: 'mismo hostname',
};

/** Duplicados candidatos del cliente (§2.4) — sólo admin/operator, herramienta de operaciones. */
function DuplicateDevicesCard({ clientId }: { clientId: string }) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ target: string; clientId: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<DuplicateCandidate[]>(`/devices/duplicates?client_id=${clientId}`)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (!loading && candidates.length === 0) return null;

  return (
    <div className="cd-panel bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-white flex items-center gap-2">
        <h4 className="text-sm font-black tracking-wide">Duplicados a revisar {candidates.length > 0 ? `(${candidates.length})` : ''}</h4>
      </div>
      {loading ? (
        <p className="px-4 py-6 text-xs font-semibold text-slate-400">Buscando duplicados…</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {candidates.map((c) => (
            <div key={`${c.a_id}-${c.b_id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
              <div>
                <p className="font-bold text-slate-700">
                  {c.a_serial ?? c.a_ip ?? c.a_mac ?? '—'} <span className="text-slate-400">↔</span> {c.b_serial ?? c.b_ip ?? c.b_mac ?? '—'}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{DUPLICATE_REASON_LABEL[c.reason] ?? c.reason}</p>
              </div>
              <button
                onClick={() => setMergeTarget({ target: c.a_id, clientId })}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-bold border border-amber-200"
              >
                Revisar
              </button>
            </div>
          ))}
        </div>
      )}
      {mergeTarget && (
        <MergeDeviceModal
          isOpen={true} onClose={() => setMergeTarget(null)} onDone={load}
          deviceId={mergeTarget.target} clientId={mergeTarget.clientId}
        />
      )}
    </div>
  );
}

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  // Alta/baja de monitor son POST/DELETE /agents — fuera del allowlist de
  // client_viewer (ver rolePolicy.ts): sin este chequeo el botón mandaría la
  // request y el usuario vería un 403 recién al hacer click.
  const isReadOnlyViewer = role === 'client_viewer';
  const { showToast } = useToast();
  const now = useNow();
  const { client, monitors, usage, loading, error, createMonitor, deleteMonitor, updateNotifications } = useClientDetail(id!);

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
    && (now - new Date(m.last_seen).getTime() <= OFFLINE_THRESHOLD_MS)
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
        <ChevronRight size={14} className="text-slate-400" />
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

            {/* Canales de notificación */}
            <NotificationSettingsCard
              email={client.notification_email}
              webhookUrl={client.notification_webhook_url}
              canEdit={!isReadOnlyViewer}
              onSave={updateNotifications}
            />

            {!isReadOnlyViewer && id && <DuplicateDevicesCard clientId={id} />}

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
              {!isReadOnlyViewer && (
                <button
                  onClick={() => setShowMonitorModal(true)}
                  className="bg-brand hover:bg-[#2471a3] text-white px-6 py-3 rounded-2xl flex items-center gap-3 text-sm font-extrabold shadow-lg shadow-blue-900/10 transition-all active:scale-95 group"
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
                            <div className="p-3 bg-slate-50 rounded-2xl group-hover/m:bg-blue-50 transition-colors">
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
                            className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-2xl bg-slate-100 text-sm font-black text-brand hover:bg-brand hover:text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all active:scale-90">
                            {m.device_count}
                          </Link>
                        </td>
                        <td className="text-right">
                          {!isReadOnlyViewer && (
                            <button
                              onClick={() => setMonitorToDelete({ id: m.id, name: m.name })}
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
