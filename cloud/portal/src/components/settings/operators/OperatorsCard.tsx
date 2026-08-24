import { useState, useEffect, useCallback } from 'react';
import { User, UserPlus, Shield } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import type { DBUser, DBClient } from '../../../types/settings';
import UserTable from './UserTable';
import CreateUserModal from './CreateUserModal';
import ResetPasswordModal from './ResetPasswordModal';
import RoleChangeModal from './RoleChangeModal';

export default function OperatorsCard() {
  const { role: currentUserRole, userId: currentUserId } = useAuth();
  const isAdmin = currentUserRole === 'admin';

  const [users, setUsers] = useState<DBUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [clients, setClients] = useState<DBClient[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resettingUser, setResettingUser] = useState<DBUser | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<DBUser | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    setUserError(null);
    try {
      const data = await api.get<DBUser[]>('/portal/users');
      setUsers(data);
    } catch (err: unknown) {
      setUserError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al obtener usuarios');
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  // Lista de clientes para asignar a un client_viewer — el admin ya ve todos los
  // clientes por `GET /clients` sin scoping, no hace falta un endpoint aparte.
  const fetchClients = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.get<DBClient[]>('/clients');
      setClients(data);
    } catch (err: unknown) {
      console.error('Error al obtener clientes', err);
    }
  }, [isAdmin]);

  useEffect(() => {
    const init = async () => {
      await fetchUsers();
      await fetchClients();
    };
    void init();
  }, [fetchUsers, fetchClients]);

  const toggleUserActive = async (user: DBUser) => {
    if (user.id === currentUserId) {
      alert("No puedes desactivar tu propio usuario.");
      return;
    }
    try {
      await api.put(`/portal/users/${user.id}`, { active: !user.active });
      fetchUsers();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar estado del usuario');
    }
  };

  // Cambiar rol de usuario. `client_viewer` necesita un client_id — la CHECK de
  // la base lo exige, así que en vez de mandar la request y mostrar el 400 de
  // vuelta, se abre un mini-modal a elegir cliente ANTES de confirmar.
  const handleRoleChange = async (user: DBUser, role: string, clientId?: string) => {
    if (user.id === currentUserId) {
      alert("No puedes cambiar tu propio rol.");
      return;
    }
    if (role === 'client_viewer' && !clientId) {
      setRoleChangeUser(user);
      return;
    }
    try {
      await api.put(`/portal/users/${user.id}`, { role, ...(clientId ? { client_id: clientId } : {}) });
      fetchUsers();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar rol');
    }
  };

  const handleDeleteUser = async (user: DBUser) => {
    if (user.id === currentUserId) {
      alert("No puedes eliminar tu propio usuario.");
      return;
    }
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente al operador '${user.username}'?`)) {
      return;
    }
    try {
      await api.delete(`/portal/users/${user.id}`);
      fetchUsers();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al eliminar usuario');
    }
  };

  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 text-brand rounded-2xl">
            <User size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Gestión de Operadores</h3>
            <p className="text-xs text-slate-500 font-medium">Control de accesos y administración de técnicos del portal.</p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-2xl text-xs font-extrabold shadow-md hover:shadow-lg transition-all"
          >
            <UserPlus size={16} />
            Registrar Operador
          </button>
        )}
      </div>

      {!isAdmin ? (
        <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-3xl flex items-start gap-3">
          <Shield size={20} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-amber-800">Privilegios de Administrador Requeridos</h4>
            <p className="text-[11px] text-amber-700/80 leading-relaxed mt-1 font-medium">
              La creación, modificación y desactivación de operadores en STC Cloud está estrictamente restringida a usuarios con rol <code className="bg-amber-100/50 px-1 py-0.5 rounded text-amber-900 font-bold uppercase tracking-tight">admin</code>. Contacta al administrador principal si necesitas agregar un nuevo operador.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {userError && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">
              {userError}
            </div>
          )}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
            </div>
          ) : (
            <UserTable
              users={users}
              currentUserId={currentUserId}
              onRoleChange={handleRoleChange}
              onToggleActive={toggleUserActive}
              onResetPasswordClick={setResettingUser}
              onDeleteClick={handleDeleteUser}
            />
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal clients={clients} onClose={() => setShowCreateModal(false)} onCreated={fetchUsers} />
      )}

      {resettingUser && (
        <ResetPasswordModal user={resettingUser} onClose={() => setResettingUser(null)} />
      )}

      {roleChangeUser && (
        <RoleChangeModal
          user={roleChangeUser}
          clients={clients}
          onClose={() => setRoleChangeUser(null)}
          onConfirm={(clientId) => {
            handleRoleChange(roleChangeUser, 'client_viewer', clientId);
            setRoleChangeUser(null);
          }}
        />
      )}
    </div>
  );
}
