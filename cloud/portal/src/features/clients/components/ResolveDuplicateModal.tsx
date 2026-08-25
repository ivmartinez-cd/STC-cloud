import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { DuplicateCandidate } from '../types/clientDetail';

function Side({ label, serial, mac, ip, onPick, busy }: {
  label: string; serial: string | null; mac: string | null; ip: string | null; onPick: () => void; busy: boolean;
}) {
  return (
    <div className="flex-1 space-y-2 rounded-[5px] border border-line-100 p-5">
      <p className="font-sans text-[13px] font-semibold text-ink-900">{label}</p>
      <p className="font-sans text-[12px] text-ink-300">Serie: {serial ?? '—'}</p>
      <p className="font-sans text-[12px] text-ink-300">MAC: {mac ?? '—'}</p>
      <p className="font-sans text-[12px] text-ink-300">IP: {ip ?? '—'}</p>
      <button
        type="button" onClick={onPick} disabled={busy}
        className="mt-2 w-full rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} className="w-full max-w-2xl overflow-hidden rounded-[5px] bg-white animate-modal-in">
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Resolver duplicado</h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-ink-300">Elegí cuál de los dos se mantiene</p>
          </div>
          <button onClick={onClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600"><X size={20} /></button>
        </header>
        <div className="space-y-4 p-6">
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
            <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-300 transition-colors duration-150 ease-in-out hover:text-ink-600">
              Mantener ambos (cerrar)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
