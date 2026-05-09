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

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = false,
  isLoading = false
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
        <header className={`px-8 py-5 flex items-center justify-between text-white ${
          isDanger ? 'bg-gradient-to-r from-rose-500 to-rose-600' : 'bg-gradient-to-r from-[#2c3e50] to-[#1a2333]'
        }`}>
          <div>
            <h2 className="font-extrabold text-sm uppercase tracking-widest">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="p-8">
          <div className="flex flex-col items-center text-center gap-4 mb-8">
            <div className={`p-4 rounded-2xl ${isDanger ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-[#2980b9]'}`}>
              <AlertTriangle size={32} />
            </div>
            <p className="text-sm font-medium text-slate-600 leading-relaxed">
              {message}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-6 py-3 rounded-xl text-white font-extrabold transition-all shadow-lg text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${
                isDanger 
                  ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-900/20' 
                  : 'bg-[#e67e22] hover:bg-[#d35400] shadow-orange-900/20'
              }`}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

