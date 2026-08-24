import { Key, Trash2 } from 'lucide-react';
import type { DBUser } from '../../../types/settings';

export default function UserTable({
  users,
  currentUserId,
  onRoleChange,
  onToggleActive,
  onResetPasswordClick,
  onDeleteClick,
}: {
  users: DBUser[];
  currentUserId: string | null;
  onRoleChange: (user: DBUser, role: string) => void;
  onToggleActive: (user: DBUser) => void;
  onResetPasswordClick: (user: DBUser) => void;
  onDeleteClick: (user: DBUser) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-100">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/70 border-b border-slate-100">
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Operador</th>
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Rol</th>
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Cliente</th>
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Estado</th>
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Creado el</th>
            <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 bg-white">
          {users.map(u => (
            <tr key={u.id} className="hover:bg-slate-50/30 transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold text-sm uppercase">
                    {u.username.slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-extrabold text-slate-800 text-sm">{u.username}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{u.id}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <select
                  value={u.role}
                  onChange={(e) => onRoleChange(u, e.target.value)}
                  disabled={u.id === currentUserId}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                  <option value="client_viewer">Cliente</option>
                </select>
              </td>
              <td className="px-6 py-4 text-xs font-medium text-slate-500">
                {u.role === 'client_viewer' ? (u.client_name || '—') : '—'}
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => onToggleActive(u)}
                  disabled={u.id === currentUserId}
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-60 ${
                    u.active
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-rose-50 text-rose-500 border border-rose-100'
                  }`}
                >
                  {u.active ? 'Activo' : 'Desactivado'}
                </button>
              </td>
              <td className="px-6 py-4 text-xs font-medium text-slate-500">
                {new Date(u.created_at).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onResetPasswordClick(u)}
                    title="Restablecer Contraseña"
                    className="p-2 text-slate-400 hover:text-brand hover:bg-brand/10 rounded-xl transition-all"
                  >
                    <Key size={16} />
                  </button>
                  <button
                    onClick={() => onDeleteClick(u)}
                    disabled={u.id === currentUserId}
                    title="Eliminar Operador"
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
