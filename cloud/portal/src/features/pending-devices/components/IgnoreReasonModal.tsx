import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrandModal } from '../../../shared/components/BrandModal';

interface Props {
  isOpen: boolean;
  count: number;
  acting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

function ReasonFooter({ reason, acting, onCancel, onConfirm }: { reason: string; acting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex justify-end gap-2.5">
      <button onClick={onCancel} disabled={acting} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50">
        Cancelar
      </button>
      <button
        onClick={onConfirm} disabled={reason.trim().length < 3 || acting}
        className="inline-flex items-center gap-2 rounded-[3px] border border-brand-chip-border bg-brand-soft px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-chip-border disabled:opacity-50"
      >
        {acting && <Loader2 className="h-4 w-4 animate-spin" />} Ignorar
      </button>
    </div>
  );
}

/** Motivo obligatorio para ignorar (mismo backend que antes — `reason` mín. 3
 * caracteres) — mismo chrome `BrandModal` que el resto de la pantalla, en vez
 * del modal a medida que tenía la versión vieja. */
export default function IgnoreReasonModal({ isOpen, count, acting, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const close = () => { setReason(''); onClose(); };
  return (
    <BrandModal isOpen={isOpen} onClose={close} title="Ignorar equipos" widthPx={440}>
      <div className="space-y-4">
        <p className="font-sans text-[13px] leading-[1.55] text-ink-700">
          Los {count} equipo(s) seleccionado(s) dejarán de reportar lecturas hasta que alguien los reactive. Indicá el motivo:
        </p>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
          placeholder="Ej: impresora de otra empresa en la misma red"
          className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
        />
        <ReasonFooter reason={reason} acting={acting} onCancel={close} onConfirm={() => onConfirm(reason.trim())} />
      </div>
    </BrandModal>
  );
}
