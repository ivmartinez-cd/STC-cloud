import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../store/AuthContext';
import { useDebounce } from '../../../../shared/hooks/useDebounce';
import { api } from '../../../../shared/lib/api';
import { operatorsBreakdown } from '../../lib/settingsPresentation';
import type { DBUser, DBClient } from '../../types/settings';
import OperatorsHeader from './OperatorsHeader';
import OperatorsFilterBar, { type OperatorFilter } from './OperatorsFilterBar';
import OperatorsTable from './OperatorsTable';
import OperatorDetailModal from './OperatorDetailModal';
import RolePermissionsModal from './RolePermissionsModal';
import CreateUserModal from './CreateUserModal';
import ResetPasswordModal from './ResetPasswordModal';
import RoleChangeModal from './RoleChangeModal';

function useOperatorsState() {
  const [users, setUsers] = useState<DBUser[]>([]);
  const [clients, setClients] = useState<DBClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { users, setUsers, clients, setClients, loading, setLoading, error, setError };
}

/** Separado de `useOperators` por el límite de 20 líneas/función. */
function useFetchUsers(isAdmin: boolean, st: ReturnType<typeof useOperatorsState>) {
  return useCallback(async () => {
    if (!isAdmin) return;
    st.setLoading(true);
    st.setError(null);
    try {
      st.setUsers(await api.get<DBUser[]>('/portal/users'));
    } catch (err: unknown) {
      st.setError((err as Error).message || 'Error al obtener usuarios');
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
}

function useOperators(isAdmin: boolean) {
  const st = useOperatorsState();
  const fetchUsers = useFetchUsers(isAdmin, st);

  useEffect(() => {
    void fetchUsers();
    if (isAdmin) api.get<DBClient[]>('/clients').then(st.setClients).catch(() => { /* comodidad: modal sin selector */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUsers, isAdmin]);

  return { ...st, fetchUsers };
}

function filterUsers(users: DBUser[], query: string, filter: OperatorFilter): DBUser[] {
  let rows = users;
  if (filter === 'administradores') rows = rows.filter((u) => u.role === 'admin');
  if (filter === 'suspendidos') rows = rows.filter((u) => !u.active);
  if (query.trim().length >= 2) {
    const q = query.trim().toLowerCase();
    rows = rows.filter((u) => u.username.toLowerCase().includes(q));
  }
  return rows;
}

/** Handoff hifi #3, fase 2, 26/08/2026 — reemplaza el `OperatorsCard.tsx`
 * anterior: header + filtro + tabla densa + panel de detalle en vez de
 * controles sueltos por celda. CRUD sin cambios de comportamiento, sólo de
 * presentación (ver `OperatorDetailModal.tsx` sobre qué modales de acción no
 * se tocaron en esta fase). */
export default function OperatorsCard() {
  const { role: currentUserRole, userId: currentUserId } = useAuth();
  const isAdmin = currentUserRole === 'admin';
  const { users, clients, loading, error, fetchUsers } = useOperators(isAdmin);

  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounce(rawQuery, 250);
  const [filter, setFilter] = useState<OperatorFilter>('todos');
  const filtered = useMemo(() => filterUsers(users, query, filter), [users, query, filter]);

  const [detailUser, setDetailUser] = useState<DBUser | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resettingUser, setResettingUser] = useState<DBUser | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<DBUser | null>(null);

  const toggleUserActive = async (user: DBUser) => {
    if (user.id === currentUserId) return;
    await api.put(`/portal/users/${user.id}`, { active: !user.active });
    void fetchUsers();
  };

  const handleRoleChange = async (user: DBUser, role: string, clientId?: string) => {
    if (user.id === currentUserId) return;
    if (role === 'client_viewer' && !clientId) { setDetailUser(null); setRoleChangeUser(user); return; }
    await api.put(`/portal/users/${user.id}`, { role, ...(clientId ? { client_id: clientId } : {}) });
    void fetchUsers();
    setDetailUser(null);
  };

  const handleDeleteUser = async (user: DBUser) => {
    if (user.id === currentUserId) return;
    if (!window.confirm(`¿Eliminar permanentemente al operador '${user.username}'?`)) return;
    await api.delete(`/portal/users/${user.id}`);
    void fetchUsers();
    setDetailUser(null);
  };

  if (!isAdmin) return null; // la tarjeta entera es admin-only — mismo criterio que antes, sin panel de "acceso denegado"

  return (
    <>
      <OperatorsHeader count={users.length} isAdmin={isAdmin} onViewPermissions={() => setShowPermissions(true)} onAddOperator={() => setShowCreateModal(true)} />
      <div className="rounded-[5px] border border-line-100 bg-white">
        <OperatorsFilterBar query={rawQuery} onQueryChange={setRawQuery} filter={filter} onFilterChange={setFilter} />
        {error ? (
          <div className="px-5 py-8 text-center font-sans text-[12.5px] text-ink-900">{error}</div>
        ) : (
          <OperatorsTable users={filtered} currentUserId={currentUserId} loading={loading} onOpen={setDetailUser} />
        )}
        {!loading && !error && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
            <span className="font-sans text-[12px] text-ink-300">{operatorsBreakdown(users)}</span>
            <Link to="/activity" className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">VER REGISTRO DE ACCESOS →</Link>
          </div>
        )}
      </div>

      {detailUser && (
        <OperatorDetailModal
          user={detailUser} isSelf={detailUser.id === currentUserId} onClose={() => setDetailUser(null)}
          onRoleChange={handleRoleChange} onToggleActive={(u) => { void toggleUserActive(u); setDetailUser(null); }}
          onResetPassword={(u) => { setDetailUser(null); setResettingUser(u); }}
          onDelete={(u) => { void handleDeleteUser(u); }}
        />
      )}
      <RolePermissionsModal isOpen={showPermissions} onClose={() => setShowPermissions(false)} />
      {showCreateModal && <CreateUserModal clients={clients} onClose={() => setShowCreateModal(false)} onCreated={fetchUsers} />}
      {resettingUser && <ResetPasswordModal user={resettingUser} onClose={() => setResettingUser(null)} />}
      {roleChangeUser && (
        <RoleChangeModal
          user={roleChangeUser} clients={clients} onClose={() => setRoleChangeUser(null)}
          onConfirm={(clientId) => { void handleRoleChange(roleChangeUser, 'client_viewer', clientId); setRoleChangeUser(null); }}
        />
      )}
    </>
  );
}
