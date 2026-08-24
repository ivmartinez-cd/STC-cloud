import { useState } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { api } from '../../../lib/api';
import type { DBUser } from '../../../types/settings';

export default function ResetPasswordModal({ user, onClose }: { user: DBUser; onClose: () => void }) {
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword) return;
    setResetLoading(true);
    setResetError(null);
    try {
      await api.put(`/portal/users/${user.id}`, {
        password: resetPassword,
      });
      alert("Contraseña actualizada con éxito");
      onClose();
    } catch (err: unknown) {
      setResetError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar contraseña');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] max-w-md w-full p-8 border border-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-brand/10 text-brand rounded-2xl">
            <Key size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Restablecer Contraseña</h3>
            <p className="text-xs text-slate-600 font-medium">Asigna una nueva clave para '{user.username}'.</p>
          </div>
        </div>

        {resetError && (
          <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-semibold mb-4">
            {resetError}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Nueva Contraseña</label>
            <div className="relative">
              <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type={showResetPassword ? 'text' : 'password'}
                required
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="cd-input w-full !pl-10 !pr-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-4 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl text-xs font-extrabold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={resetLoading}
              className="flex-1 px-5 py-4 bg-brand hover:bg-brand-hover text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {resetLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : 'Actualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
