import { Key, RefreshCw, Copy, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function MonitorRegenKeyModal({ regenKey, onClose }: { regenKey: string; onClose: () => void }) {
  const { showToast } = useToast();

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/70 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-modal-in border border-white/20">
        <header className="px-10 py-10 bg-gradient-to-r from-amber-500 to-orange-600 text-white relative overflow-hidden">
          <div className="relative z-10">
            <Key size={48} className="mb-4 text-amber-200" />
            <h2 className="text-2xl font-black tracking-tight uppercase">Nueva Llave Generada</h2>
            <p className="text-[10px] font-black text-amber-100 uppercase tracking-[0.2em] mt-1">Vínculo de seguridad actualizado</p>
          </div>
          <div className="absolute -right-10 -top-10 opacity-10"><RefreshCw size={160} /></div>
        </header>
        <div className="p-12 space-y-8">
          <p className="text-xs font-bold text-slate-500 leading-relaxed">
            Copia esta llave y pégala en la configuración del agente local para restablecer la comunicación.
          </p>
          <div className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-between gap-4">
            <code className="text-brand font-black text-lg tracking-wider break-all">{regenKey}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(regenKey); showToast('Nueva llave copiada', 'success'); }}
              className="p-4 bg-white text-brand rounded-2xl shadow-md hover:bg-brand hover:text-white transition-all active:scale-90"
            >
              <Copy size={20} />
            </button>
          </div>
          <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 flex gap-4">
            <AlertTriangle className="text-amber-600 shrink-0" size={24} />
            <div className="space-y-1">
              <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Importante</p>
              <p className="text-xs text-amber-800/70 font-bold leading-relaxed">
                Esta llave expirará en 24 horas. Utilízala para reactivar el agente en el servidor del cliente. El agente anterior será desconectado automáticamente.
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-full py-5 rounded-[24px] bg-[#1a2333] text-white font-black hover:bg-black transition-all shadow-xl shadow-slate-900/20 active:scale-95">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
