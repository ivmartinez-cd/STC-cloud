import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Radio, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { BrandModal } from '../components/ui/BrandModal';

interface Batch {
  id: string;
  number: number;
  action: string;
  name: string | null;
  scheduled_at: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_items?: number;
}

interface BatchDetail extends Batch {
  items: {
    agent_id: string; agent_name: string | null;
    device_id: string | null; device_ip: string | null; device_label: string | null;
    command_status: string | null;
  }[];
}

interface AgentOption { id: string; name: string; status: string; }
interface ClientOption { id: string; name: string; }
interface DeviceOption { id: string; serial_number: string | null; model: string | null; name: string | null; }

const ACTION_LABELS: Record<string, string> = {
  RESCAN: 'Re-escanear red',
  FORCE_SCAN: 'Forzar lectura ahora',
  RESTART: 'Reiniciar agente',
  FORCE_UPDATE: 'Forzar actualización',
  RESTART_PRINTER: 'Reiniciar impresora (SNMP)',
};

/** Único que targetea EQUIPOS en vez de agentes — agente v1.2.0, SNMP SET real. */
const DEVICE_TARGETED_ACTIONS = new Set(['RESTART_PRINTER']);

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  sent: 'Enviado',
  completed: 'Completado',
  completed_with_errors: 'Completado con errores',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-600',
  sent: 'bg-amber-50 text-amber-600',
  completed: 'bg-emerald-50 text-emerald-600',
  completed_with_errors: 'bg-rose-50 text-rose-600',
  cancelled: 'bg-slate-100 text-slate-500',
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function deviceLabelOf(d: DeviceOption): string {
  return d.name || d.serial_number || d.model || d.id;
}

/**
 * Acciones remotas en bloque (Fase 4.6 del gap analysis vs HP SDS —
 * "Acciones de HP SDS en bloque"; RESTART_PRINTER sumada en el agente
 * v1.2.0). Lotes con programación y estado agregado.
 */
export default function RemoteActions() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Batch[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<BatchDetail | null>(null);

  const [action, setAction] = useState('RESCAN');
  const [name, setName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [targetClientId, setTargetClientId] = useState('');
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDeviceTargeted = DEVICE_TARGETED_ACTIONS.has(action);

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ items: Batch[] }>('/remote-actions?limit=100')
      .then((d) => setItems(d.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<AgentOption[]>('/agents').then((a) => setAgents(a.filter((x) => x.status !== 'revoked'))).catch(() => setAgents([]));
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (!targetClientId) { setDevices([]); return; }
    api.get<DeviceOption[]>(`/clients/${targetClientId}/devices`).then(setDevices).catch(() => setDevices([]));
  }, [targetClientId]);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/remote-actions', {
        action, name: name.trim() || null,
        ...(isDeviceTargeted ? { device_ids: selectedDevices } : { agent_ids: selectedAgents }),
        scheduled_at: when ? new Date(when).toISOString() : null,
      });
      showToast('Lote creado', 'success');
      setModalOpen(false);
      setSelectedAgents([]); setSelectedDevices([]); setTargetClientId(''); setName(''); setWhen('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (b: Batch) => {
    try {
      await api.post(`/remote-actions/${b.id}/cancel`);
      showToast(`Lote #${b.number} cancelado`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cancelar', 'error');
    }
  };

  const openDetail = (b: Batch) => {
    api.get<BatchDetail>(`/remote-actions/${b.id}`).then(setDetail).catch(() => setDetail(null));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
            <Radio size={28} className="text-brand" /> Acciones
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Acciones remotas en bloque sobre los monitores — programadas y con seguimiento por lote.
          </p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] hover:bg-black text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all">
          <Plus size={15} /> Nueva acción
        </button>
      </header>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={28} className="text-brand animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-sm text-slate-400 font-medium">
          Sin lotes todavía.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Lote', 'Acción', 'Nombre', 'Elementos', 'Programado', 'Estado', 'Completado', ''].map((h) => (
                  <th key={h} className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((b) => (
                <tr key={b.id} onClick={() => openDetail(b)} className="hover:bg-slate-50/50 cursor-pointer">
                  <td className="py-3 px-4 font-bold text-brand">#{b.number}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{ACTION_LABELS[b.action] ?? b.action}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{b.name ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{b.total_items ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{fmtDate(b.scheduled_at)}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{fmtDate(b.completed_at)}</td>
                  <td className="py-3 px-4">
                    {b.status === 'scheduled' && (
                      <button onClick={(e) => { e.stopPropagation(); cancel(b); }} title="Cancelar"
                        className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all">
                        <XCircle size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BrandModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva acción en bloque" widthPx={560} error={error}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Acción</label>
              <select value={action} onChange={(e) => setAction(e.target.value)}
                className="w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand">
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Programar para (opcional)</label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                className="w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nombre (opcional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Relectura fin de mes"
              className="w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
          </div>

          {isDeviceTargeted ? (
            <>
              <p className="text-[10px] text-amber-600 font-bold -mt-1">
                Requiere que la credencial SNMP configurada tenga permiso de escritura en el equipo — si no lo tiene, el lote queda "Completado con errores" con el motivo.
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cliente</label>
                <select value={targetClientId} onChange={(e) => { setTargetClientId(e.target.value); setSelectedDevices([]); }}
                  className="w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand">
                  <option value="">Elegir cliente…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                  Equipos ({selectedDevices.length} seleccionados)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-3">
                  {devices.length === 0 && <p className="text-xs text-slate-400 font-medium">Elegí un cliente para ver sus equipos.</p>}
                  {devices.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={selectedDevices.includes(d.id)} onChange={() => toggleDevice(d.id)} />
                      {deviceLabelOf(d)}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                Monitores ({selectedAgents.length} seleccionados)
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-3">
                {agents.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={selectedAgents.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
            <button onClick={create} disabled={saving || (isDeviceTargeted ? selectedDevices.length === 0 : selectedAgents.length === 0)}
              className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">
              {saving ? 'Creando…' : 'Crear lote'}
            </button>
          </div>
        </div>
      </BrandModal>

      <BrandModal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `Lote #${detail.number}` : ''} widthPx={520}>
        {detail && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium">
              {ACTION_LABELS[detail.action]} · {STATUS_LABELS[detail.status]} · programado {fmtDate(detail.scheduled_at)}
            </p>
            {detail.items.map((i) => (
              <div key={i.device_id ?? i.agent_id} className="flex items-center justify-between text-xs font-bold text-slate-600 border-b border-slate-50 py-2">
                {i.device_label ?? i.device_ip ?? i.agent_name ?? i.agent_id}
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                  i.command_status === 'success' ? 'bg-emerald-50 text-emerald-600'
                  : i.command_status === 'error' ? 'bg-rose-50 text-rose-600'
                  : 'bg-amber-50 text-amber-600'
                }`}>{i.command_status ?? 'en cola'}</span>
              </div>
            ))}
          </div>
        )}
      </BrandModal>
    </div>
  );
}
