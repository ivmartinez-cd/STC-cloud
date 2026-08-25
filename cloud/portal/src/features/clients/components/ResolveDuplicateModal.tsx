import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { DuplicateCandidate } from '../types/clientDetail';

function Side({ label, serial, mac, ip, onPick, busy }: {
  label: string; serial: string | null; mac: string | null; ip: string | null; onPick: () => void; busy: boolean;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-slate-100 p-5 space-y-2">
      <p className="text-sm font-black text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">Serie: {serial ?? '—'}</p>
      <p className="text-xs text-slate-500">MAC: {mac ?? '—'}</p>
      <p className="text-xs text-slate-500">IP: {ip ?? '—'}</p>
      <button
        type="button" onClick={onPick} disabled={busy}
        className="mt-2 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-all hover:bg-brand-hover disabled:opacity-50"
      >
        Fusionar, manteniendo éste
      </button>
    </div>
  );
}

function labelOf(brand: string | null, model: string | null, name: string | null, serial: string | null): string {
  return name || [brand, model].filter(Boolean).join(' ') || serial || 'Equipo';
}

/**
 * Comparación lado a lado de un par de duplicados (README: "abre un modal de
 * comparación... Fusionar / Mantener ambos / Descartar"). Alcance real: "Fusionar"
 * usa `POST /devices/:id/merge` (ya existente); no hay en el backend un concepto de
 * "descartar"/"ignorar" un par candidato (se recalcula en vivo por heurística SQL,
 * no es una fila persistida) — "Mantener ambos" acá es honesto: sólo cierra el
 * modal, no falsea una persistencia que no existe.
 */
export default function ResolveDuplicateModal({
  isOpen, pair, onClose, onDone,
}: {
  isOpen: boolean;
  pair: DuplicateCandidate;
  onClose: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const merge = async (keep: 'a' | 'b') => {
    setBusy(true);
    try {
      const targetId = keep === 'a' ? pair.a_id : pair.b_id;
      const sourceId = keep === 'a' ? pair.b_id : pair.a_id;
      await api.post(`/devices/${targetId}/merge`, { sourceDeviceId: sourceId });
      showToast('Duplicado fusionado', 'success');
      onDone();
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al fusionar', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md animate-overlay-in">
      <div className="w-full max-w-2xl overflow-hidden rounded-[24px] bg-white shadow-2xl animate-modal-in">
        <header className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h2 className="text-lg font-black tracking-tight text-[#1a2333]">Resolver duplicado</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Elegí cuál de los dos se mantiene</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X size={22} /></button>
        </header>
        <div className="space-y-4 p-8">
          <div className="flex gap-4">
            <Side
              label={labelOf(pair.a_brand, pair.a_model, pair.a_name, pair.a_serial)}
              serial={pair.a_serial} mac={pair.a_mac} ip={pair.a_ip} busy={busy} onPick={() => merge('a')}
            />
            <Side
              label={labelOf(pair.b_brand, pair.b_model, pair.b_name, pair.b_serial)}
              serial={pair.b_serial} mac={pair.b_mac} ip={pair.b_ip} busy={busy} onPick={() => merge('b')}
            />
          </div>
          {busy && <div className="flex justify-center"><Loader2 size={18} className="animate-spin text-brand" /></div>}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700">
              Mantener ambos (cerrar)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
