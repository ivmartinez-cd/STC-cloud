import { useEffect, useState } from 'react';
import { BrandModal } from '../../ui/BrandModal';
import { api } from '../../../lib/api';
import type { ClientOption, AgentOption } from './types';

interface MoveDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
  currentClientId: string | null;
  currentAgentId: string | null;
}

export function MoveDeviceModal({ isOpen, onClose, onDone, deviceId, currentClientId, currentAgentId }: MoveDeviceModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmClientChange, setConfirmClientChange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason(''); setError(null); setConfirmClientChange(false);
    setClientId(currentClientId ?? '');
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [isOpen, currentClientId]);

  useEffect(() => {
    if (!clientId) { setAgents([]); return; }
    api.get<AgentOption[]>(`/clients/${clientId}/monitors`).then(setAgents).catch(() => setAgents([]));
  }, [clientId]);

  const clientChanged = clientId !== currentClientId;

  const move = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/move`, {
        agentId, reason, ...(clientChanged ? { confirmClientChange } : {}),
      });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title="Mover equipo" widthPx={480} error={error}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Cliente destino</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setAgentId(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Seleccionar…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Monitor destino</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" disabled={!clientId}>
            <option value="">Seleccionar…</option>
            {agents.filter((a) => a.id !== currentAgentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Motivo</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {clientChanged && clientId && (
          <label className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
            <input type="checkbox" checked={confirmClientChange} onChange={(e) => setConfirmClientChange(e.target.checked)} className="mt-0.5" />
            Entiendo que el historial ya facturado a este cliente queda con el cliente anterior — el cierre emitido no se recalcula.
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={move}
            disabled={loading || !agentId || !reason.trim() || (clientChanged && !confirmClientChange)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {loading ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
