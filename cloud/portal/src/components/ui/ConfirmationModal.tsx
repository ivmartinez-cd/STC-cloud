import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { BrandModal } from './BrandModal';

/**
 * Modal de confirmación del Patrón 6 del design handoff (portado de helpdesk-manager).
 *  - `simple`: texto plano, botón primario naranja.
 *  - `warning`: bloque amarillo con ícono, botón #eab308.
 *  - `destructive`: bloque rojo + input obligatorio; el botón se habilita sólo cuando lo tipeado
 *    coincide EXACTO con `confirmText` ("Escribí ELIMINAR para confirmar").
 */
export type ConfirmationVariant = 'simple' | 'warning' | 'destructive';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  variant?: ConfirmationVariant;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  confirmText?: string;
  loading?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  extra?: ReactNode;
  widthPx?: number;
}

const BLOCK: Record<Exclude<ConfirmationVariant, 'simple'>, string> = {
  warning:     'bg-[rgba(234,179,8,.08)] border-[rgba(234,179,8,.3)] text-[#92400e]',
  destructive: 'bg-[rgba(239,68,68,.07)] border-[rgba(239,68,68,.25)] text-[#991b1b]',
};
const ICON: Record<Exclude<ConfirmationVariant, 'simple'>, string> = {
  warning:     'bg-[rgba(234,179,8,.15)] text-[#eab308]',
  destructive: 'bg-[rgba(239,68,68,.12)] text-[#ef4444]',
};
const BUTTON: Record<ConfirmationVariant, string> = {
  simple:      'bg-[#f7931d] text-white hover:bg-[#d97e0f]',
  warning:     'bg-[#eab308] text-white hover:bg-[#ca9a04]',
  destructive: 'bg-[#ef4444] text-white hover:bg-[#dc2626]',
};

export function ConfirmationModal({
  isOpen, onClose, onConfirm, title, variant = 'simple', children,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', hideCancel = false, confirmText = 'ELIMINAR',
  loading = false, confirmDisabled = false, error = null, extra, widthPx = 420,
}: ConfirmationModalProps) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) { setPrevOpen(isOpen); if (isOpen) setTyped(''); }

  const needsTyping = variant === 'destructive';
  const enabled = !loading && !confirmDisabled && (!needsTyping || typed === confirmText);
  const Icon = variant === 'destructive' ? Trash2 : AlertTriangle;

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title={title} widthPx={widthPx} error={error}>
      <div className="flex flex-col gap-[18px]">
        {variant === 'simple' ? (
          <div className="text-sm leading-[1.55] text-slate-600">{children}</div>
        ) : (
          <div className={`flex gap-3.5 rounded-[10px] border p-3.5 ${BLOCK[variant]}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON[variant]}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="text-sm leading-[1.55]">{children}</div>
          </div>
        )}
        {needsTyping && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Escribí <span className="font-mono text-slate-800">{confirmText}</span> para confirmar
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-10 rounded-[10px] border border-slate-200 px-3 text-sm font-mono outline-none focus:border-[#ef4444] focus:ring-2 focus:ring-[rgba(239,68,68,.2)]"
            />
          </div>
        )}
        {extra}
        <div className="mt-1 flex justify-end gap-2.5">
          {!hideCancel && (
            <button onClick={onClose} disabled={loading} className="h-10 rounded-[10px] border border-slate-200 px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
              {cancelLabel}
            </button>
          )}
          <button onClick={onConfirm} disabled={!enabled} className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]}`}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}

export default ConfirmationModal;
