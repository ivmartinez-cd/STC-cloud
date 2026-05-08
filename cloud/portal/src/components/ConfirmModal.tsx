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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <header className={`px-6 py-4 flex items-center justify-between ${isDanger ? 'bg-red-500' : 'bg-[#2980b9]'} text-white`}>
          <h2 className="font-bold text-sm uppercase tracking-wider">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`shrink-0 p-2.5 rounded-xl ${isDanger ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-[#2980b9]'}`}>
              <AlertTriangle size={24} />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {message}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 rounded-lg text-white font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#2980b9] hover:bg-[#2471a3]'
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
