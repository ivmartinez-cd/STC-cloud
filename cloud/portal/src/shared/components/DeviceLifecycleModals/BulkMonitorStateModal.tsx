import { useEffect, useState } from 'react';
import { BrandModal } from '../BrandModal';
import { api } from '../../lib/api';
import type { BulkActionResult } from './types';

const MONITOR_STATE_OPTIONS: Array<{ value: 'full' | 'supplies_only' | 'reports_only' | 'disabled'; label: string }> = [
  { value: 'full', label: 'Totalmente habilitado' },
  { value: 'supplies_only', label: 'Solo consumibles' },
  { value: 'reports_only', label: 'Solo informes' },
  { value: 'disabled', label: 'Deshabilitado' },
];

interface BulkMonitorStateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: BulkActionResult) => void;
  deviceIds: string[];
}

export function BulkMonitorStateModal({ isOpen, onClose, onDone, deviceIds }: BulkMonitorStateModalProps) {
  const [state, setState] = useState<'full' | 'supplies_only' | 'reports_only' | 'disabled'>('full');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setState('full'); setReason(''); setError(null); } }, [isOpen]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.post<BulkActionResult>('/devices/bulk/monitor-state', { ids: deviceIds, state, reason: reason || undefined });
      onDone(result); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title={`Cambiar estado de monitoreo — ${deviceIds.length} equipo(s)`} widthPx={440} error={error}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nuevo estado</label>
          <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand">
            {MONITOR_STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Motivo (opcional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" />
        </div>
        <div className="flex justify-end gap-2.5 pt-2">
          <button onClick={onClose} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">Cancelar</button>
          <button onClick={confirm} disabled={loading} className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
            {loading ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
