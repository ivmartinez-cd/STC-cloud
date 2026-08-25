import { Key, Copy, AlertTriangle } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';

export default function MonitorRegenKeyModal({ regenKey, onClose }: { regenKey: string; onClose: () => void }) {
  const { showToast } = useToast();

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div className="w-full max-w-lg overflow-hidden rounded-[16px] bg-white animate-modal-in" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <header className="border-b border-line-150 px-8 py-7">
          <Key size={28} className="mb-3 text-brand" />
          <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Nueva llave generada</h2>
          <p className="mt-1 font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Vínculo de seguridad actualizado</p>
        </header>
        <div className="space-y-6 p-8">
          <p className="font-sans text-[12.5px] leading-[1.55] text-ink-700">
            Copia esta llave y pégala en la configuración del agente local para restablecer la comunicación.
          </p>
          <div className="flex items-center justify-between gap-4 rounded-[5px] border border-dashed border-line-300 bg-surface-input p-4">
            <code className="break-all font-mono text-[14px] font-semibold tracking-wide text-brand">{regenKey}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(regenKey); showToast('Nueva llave copiada', 'success'); }}
              className="rounded-[3px] border border-line-300 bg-white p-2.5 text-brand transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
            >
              <Copy size={18} />
            </button>
          </div>
          <div className="flex gap-3 rounded-[3px] border border-brand-chip-border bg-brand-soft p-4">
            <AlertTriangle className="shrink-0 text-brand-severe" size={20} />
            <div className="space-y-1">
              <p className="font-montserrat text-[10.5px] font-bold uppercase tracking-[.08em] text-brand-severe">Importante</p>
              <p className="font-sans text-[12px] font-semibold leading-[1.5] text-brand-accent">
                Esta llave expirará en 24 horas. Utilízala para reactivar el agente en el servidor del cliente. El agente anterior será desconectado automáticamente.
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-full rounded-[3px] bg-brand py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
