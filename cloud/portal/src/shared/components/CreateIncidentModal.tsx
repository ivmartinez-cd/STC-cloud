import { useEffect, useState } from 'react';
import { BrandModal } from './BrandModal';
import { api } from '../lib/api';
import type { AlertClassOption } from '../types/alerts';

interface ClientOption { id: string; name: string; }
interface DeviceOption { id: string; serial_number: string | null; model: string | null; name: string | null; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (incidentId: string) => void;
  clients: ClientOption[];
  /** Fase 11 del gap analysis vs HP SDS — precarga desde `Alerts.tsx` ("Crear incidente" sobre una alerta puntual). */
  initialClientId?: string;
  initialDeviceId?: string;
  initialClass?: string;
  initialAlertIds?: number[];
}

/**
 * Modal de creación manual de incidentes. `clients` se recibe como prop (la
 * página que lo monta ya la tiene, admin/operator) en vez de refetchear acá.
 */
export default function CreateIncidentModal({
  isOpen, onClose, onCreated, clients, initialClientId, initialDeviceId, initialClass, initialAlertIds,
}: Props) {
  const [clientId, setClientId] = useState('');
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [klass, setKlass] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'warning' | 'critical'>('critical');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setClientId(initialClientId ?? '');
    setDeviceId(initialDeviceId ?? '');
    setKlass(initialClass ?? '');
    setTitle(''); setDescription(''); setSeverity('critical'); setError(null);
    api.get<{ classes: AlertClassOption[] }>('/alerts/classes').then((d) => setClassOptions(d.classes)).catch(() => setClassOptions([]));
  }, [isOpen, initialClientId, initialDeviceId, initialClass]);

  useEffect(() => {
    if (!clientId) { setDevices([]); return; }
    api.get<DeviceOption[]>(`/clients/${clientId}/devices`).then(setDevices).catch(() => setDevices([]));
  }, [clientId]);

  const create = async () => {
    if (!clientId || !klass) { setError('Cliente y clase son obligatorios'); return; }
    setLoading(true); setError(null);
    try {
      const result = await api.post<{ id: string }>('/incidents', {
        client_id: clientId,
        device_id: deviceId || null,
        class: klass,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        severity,
        alert_ids: initialAlertIds && initialAlertIds.length ? initialAlertIds : undefined,
      });
      onCreated(result.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Nuevo incidente" widthPx={480} error={error}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Cliente</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setDeviceId(''); }} disabled={!!initialClientId}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">Seleccionar…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Equipo (opcional)</label>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={!clientId || !!initialDeviceId}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">Sin equipo puntual</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.serial_number || d.name || d.model || d.id}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Clase</label>
          <select value={klass} onChange={(e) => setKlass(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Seleccionar…</option>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Título (opcional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Se genera uno automático si se deja vacío" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Descripción (opcional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Severidad</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as 'warning' | 'critical')}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="critical">Crítico</option>
            <option value="warning">Advertencia</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={create} disabled={loading || !clientId || !klass} className="px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50">
            {loading ? 'Creando…' : 'Crear incidente'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
