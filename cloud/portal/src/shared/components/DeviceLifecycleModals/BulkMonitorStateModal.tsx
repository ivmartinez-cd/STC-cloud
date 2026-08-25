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
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Nuevo estado</label>
          <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {MONITOR_STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Motivo (opcional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={confirm} disabled={loading} className="px-4 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50">
            {loading ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
