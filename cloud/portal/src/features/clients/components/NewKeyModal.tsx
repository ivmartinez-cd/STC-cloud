import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';

/** Modal "mostrar una sola vez" tras crear una key — mismo criterio que RegenKeyModal.tsx (agente). */
export default function NewKeyModal({ name, apiKey, onClose }: { name: string; apiKey: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} className="w-full max-w-2xl overflow-hidden rounded-[5px] bg-white animate-modal-in">
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Nueva API Key</h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-ink-300">{name}</p>
          </div>
          <button onClick={onClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          <div className="flex gap-3.5 rounded-[3px] border border-brand-chip-border bg-brand-soft p-3.5">
            <p className="font-sans text-[13px] leading-[1.55] text-brand-severe">
              Este valor no se puede volver a mostrar. Copialo y guardalo en un lugar seguro antes de cerrar esta ventana.
            </p>
          </div>

          <div>
            <p className="mb-1.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">API Key</p>
            <div className="relative">
              <div className="rounded-[5px] bg-brand-charcoal p-6 text-center font-mono">
                <div className="select-all break-all text-[16px] font-bold tracking-widest text-white">{apiKey}</div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setCopied(true);
                  showToast('Key copiada al portapapeles', 'success');
                  setTimeout(() => setCopied(false), 3000);
                }}
                className="absolute right-3 top-3 rounded-[3px] p-2 text-white/60 transition-colors duration-150 ease-in-out hover:bg-white/10 hover:text-white"
                title="Copiar"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={onClose}
              className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
              Ya la guardé
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
