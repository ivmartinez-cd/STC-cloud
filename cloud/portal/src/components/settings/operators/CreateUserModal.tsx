import { useState } from 'react';
import { UserPlus, User, Key, Eye, EyeOff } from 'lucide-react';
import { api } from '../../../lib/api';
import type { DBClient } from '../../../types/settings';

export default function CreateUserModal({ clients, onClose, onCreated }: { clients: DBClient[]; onClose: () => void; onCreated: () => void }) {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newClientId, setNewClientId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newTotpRequired, setNewTotpRequired] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    if (newRole === 'client_viewer' && !newClientId) {
      setCreateError('Un usuario Cliente requiere elegir un cliente');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api.post('/portal/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        totp_required: newTotpRequired,
        ...(newRole === 'client_viewer' ? { client_id: newClientId } : {}),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setCreateError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al crear usuario');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] max-w-md w-full p-8 border border-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-brand/10 text-brand rounded-2xl">
            <UserPlus size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Registrar Operador</h3>
            <p className="text-xs text-slate-500 font-medium">Crea credenciales para un nuevo operario.</p>
          </div>
        </div>

        {createError && (
          <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-semibold mb-4">
            {createError}
          </div>
        )}

        <form onSubmit={handleCreateUser} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Nombre de Usuario</label>
            <div className="relative">
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                required
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="ej. juan.perez"
                className="cd-input w-full !pl-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Contraseña</label>
            <div className="relative">
              <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="cd-input w-full !pl-10 !pr-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer ml-1">
            <input type="checkbox" checked={newTotpRequired} onChange={(e) => setNewTotpRequired(e.target.checked)} />
            Exigir autenticación de dos factores (deberá enrolarse en el primer ingreso)
          </label>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Rol en el Portal</label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { val: 'operator', title: 'Operador', desc: 'Soporte estándar' },
                { val: 'admin', title: 'Administrador', desc: 'Control total' },
                { val: 'client_viewer', title: 'Cliente', desc: 'Sólo su cliente' }
              ].map(r => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => setNewRole(r.val)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    newRole === r.val
                      ? 'border-brand bg-brand/10 ring-2 ring-brand/10'
                      : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-extrabold text-sm text-[#1a2333]">{r.title}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5 font-medium">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {newRole === 'client_viewer' && (
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Cliente</label>
              <select
                required
                value={newClientId}
                onChange={e => setNewClientId(e.target.value)}
                className="cd-input w-full !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
              >
                <option value="">Seleccionar cliente…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

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
              disabled={createLoading}
              className="flex-1 px-5 py-4 bg-brand hover:bg-brand-hover text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {createLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
