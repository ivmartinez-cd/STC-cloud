import { useState } from 'react'; // v1.0.1-ui-fix
import { X, Key, Clock, Copy, Check } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface Props {
  modal: { agentName: string; key: string; expiresAt: string } | null;
  onClose: () => void;
}

export default function RegenKeyModal({ modal, onClose }: Props) {
  const { showToast } = useToast();
  const [keyCopied, setKeyCopied] = useState(false);

  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/80 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
        <header className="px-10 py-8 bg-gradient-to-r from-amber-500 to-amber-400 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tight uppercase">Llave de Activación</h2>
            <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em] mt-1">Agente: {modal.agentName}</p>
          </div>
          <button onClick={onClose} className="relative z-10 p-3 hover:bg-white/20 rounded-2xl transition-all active:scale-90">
            <X size={28} />
          </button>
          <div className="absolute -right-8 -top-8 opacity-20">
            <Key size={140} />
          </div>
        </header>

        <div className="p-10 space-y-8">
          <div className="flex gap-4 bg-amber-50 border border-amber-100 rounded-[28px] p-6">
            <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
              <Clock size={22} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-800">Llave válida por 24 horas</p>
              <p className="text-xs text-amber-600 mt-1 font-medium">
                Expira: {new Date(modal.expiresAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Código de Activación</p>
            <div className="relative group">
              <div className="p-8 bg-[#1a2333] rounded-[28px] font-mono text-center shadow-inner border border-white/5">
                <div className="text-2xl text-white font-black tracking-widest break-all select-all">
                  {modal.key}
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(modal.key);
                  setKeyCopied(true);
                  showToast('Código copiado al portapapeles', 'success');
                  setTimeout(() => setKeyCopied(false), 3000);
                }}
                className="absolute right-4 top-4 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90 flex items-center gap-2"
                title="Copiar Código"
              >
                {keyCopied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-10 py-4 bg-[#1a2333] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#2c3e50] transition-all active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
