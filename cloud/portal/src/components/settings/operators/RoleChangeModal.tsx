import { useState } from 'react';
import { Shield } from 'lucide-react';
import type { DBClient, DBUser } from '../../../types/settings';

export default function RoleChangeModal({
  user,
  clients,
  onClose,
  onConfirm,
}: {
  user: DBUser;
  clients: DBClient[];
  onClose: () => void;
  onConfirm: (clientId: string) => void;
}) {
  const [roleChangeClientId, setRoleChangeClientId] = useState(user.client_id || '');

  return (
    <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] max-w-md w-full p-8 border border-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-brand/10 text-brand rounded-2xl">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Asignar Cliente</h3>
            <p className="text-xs text-slate-500 font-medium">
              '{user.username}' pasará a ver únicamente los datos de este cliente.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Cliente</label>
          <select
            required
            value={roleChangeClientId}
            onChange={e => setRoleChangeClientId(e.target.value)}
            className="cd-input w-full !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
          >
            <option value="">Seleccionar cliente…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
            type="button"
            disabled={!roleChangeClientId}
            onClick={() => onConfirm(roleChangeClientId)}
            className="flex-1 px-5 py-4 bg-brand hover:bg-brand-hover text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
