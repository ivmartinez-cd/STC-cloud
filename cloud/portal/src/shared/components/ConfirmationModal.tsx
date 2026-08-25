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

// Handoff hifi, transversal #1: sólo naranja institucional + grises — ninguna
// variante usa amarillo ni rojo, ni siquiera "destructive" (zona de riesgo:
// borde + fondo suave, nunca relleno).
const BLOCK: Record<Exclude<ConfirmationVariant, 'simple'>, string> = {
  warning:     'bg-brand-soft border-brand-chip-border text-brand-accent',
  destructive: 'bg-brand-soft border-brand-chip-border text-brand-severe',
};
const ICON: Record<Exclude<ConfirmationVariant, 'simple'>, string> = {
  warning:     'bg-white text-brand-accent',
  destructive: 'bg-white text-brand-severe',
};
const BUTTON: Record<ConfirmationVariant, string> = {
  simple:      'bg-brand text-white hover:bg-brand-severe',
  warning:     'bg-brand text-white hover:bg-brand-severe',
  destructive: 'border border-brand-chip-border bg-white text-brand-severe hover:bg-brand-soft',
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
          <div className="font-sans text-[13px] leading-[1.55] text-ink-700">{children}</div>
        ) : (
          <div className={`flex gap-3.5 rounded-[3px] border p-3.5 ${BLOCK[variant]}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON[variant]}`}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="font-sans text-[13px] leading-[1.55]">{children}</div>
          </div>
        )}
        {needsTyping && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">
              Escribí <span className="font-mono text-ink-700">{confirmText}</span> para confirmar
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-10 rounded-[3px] border border-line-300 px-3 font-mono text-[13px] text-ink-900 outline-none focus:border-brand-severe"
            />
          </div>
        )}
        {extra}
        <div className="mt-1 flex justify-end gap-2.5">
          {!hideCancel && (
            <button onClick={onClose} disabled={loading} className="h-10 rounded-[3px] border border-line-300 px-4 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50">
              {cancelLabel}
            </button>
          )}
          <button onClick={onConfirm} disabled={!enabled} className={`inline-flex h-10 items-center gap-2 rounded-[3px] px-4 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]}`}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}

export default ConfirmationModal;
