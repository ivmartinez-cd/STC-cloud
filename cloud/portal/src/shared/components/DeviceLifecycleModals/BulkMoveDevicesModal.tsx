import { useEffect, useState } from 'react';
import { BrandModal } from '../BrandModal';
import { api } from '../../lib/api';
import type { ClientOption, AgentOption, BulkActionResult } from './types';

interface BulkMoveDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: BulkActionResult) => void;
  deviceIds: string[];
  currentClientId: string | null;
  currentAgentId: string | null;
}

export function BulkMoveDevicesModal({ isOpen, onClose, onDone, deviceIds, currentClientId, currentAgentId }: BulkMoveDevicesModalProps) {
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
      const result = await api.post<BulkActionResult>('/devices/bulk/move', {
        ids: deviceIds, agentId, reason, ...(clientChanged ? { confirmClientChange } : {}),
      });
      onDone(result); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title={`Mover ${deviceIds.length} equipo(s)`} widthPx={480} error={error}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Cliente destino</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setAgentId(''); }} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand">
            <option value="">Seleccionar…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Monitor destino</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" disabled={!clientId}>
            <option value="">Seleccionar…</option>
            {agents.filter((a) => a.id !== currentAgentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Motivo</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" />
        </div>
        {clientChanged && clientId && (
          <label className="flex items-start gap-2.5 rounded-[3px] border border-brand-chip-border bg-brand-soft p-3.5 font-sans text-[12px] leading-[1.5] text-brand-accent">
            <input type="checkbox" checked={confirmClientChange} onChange={(e) => setConfirmClientChange(e.target.checked)} className="mt-0.5" />
            Entiendo que el historial ya facturado a este cliente queda con el cliente anterior — el cierre emitido no se recalcula.
            Un equipo cuyo serial ya exista en el cliente destino queda afuera del movimiento (colisión).
          </label>
        )}
        <div className="flex justify-end gap-2.5 pt-2">
          <button onClick={onClose} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">Cancelar</button>
          <button
            onClick={move}
            disabled={loading || !agentId || !reason.trim() || (clientChanged && !confirmClientChange)}
            className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
          >
            {loading ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
