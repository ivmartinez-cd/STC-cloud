import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

/** Confirmación genérica (handoff hifi, transversal): sin degradado, radio 5px,
 * severidad expresada en naranja oscuro — nunca rojo relleno. */
const ConfirmModal = ({
  isOpen, onClose, onConfirm, title, message,
  confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false, isLoading = false,
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-[5px] bg-white" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <h2 className="font-montserrat text-[13px] font-extrabold uppercase tracking-[.08em] text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={16} />
          </button>
        </header>

        <div className="p-6">
          <div className="mb-6 flex flex-col items-center gap-3.5 text-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isDanger ? 'bg-brand-soft text-brand-severe' : 'bg-brand-soft text-brand-accent'}`}>
              <AlertTriangle size={24} />
            </div>
            <p className="font-sans text-[13px] leading-[1.55] text-ink-700">{message}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose} disabled={isLoading}
              className="flex-1 rounded-[3px] border border-line-300 px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm} disabled={isLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[3px] px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out disabled:opacity-50 ${
                isDanger ? 'bg-brand-severe hover:bg-[#a85c08]' : 'bg-brand hover:bg-brand-severe'
              }`}
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
