import { useState, useEffect, useCallback } from 'react';
import { Radio, Save, Mail, Shield, CheckCircle, Settings as SettingsIcon, Bell, User, UserPlus, Key, Trash2, Eye, EyeOff, MessageSquare, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface Thresholds {
  monitorOfflineMinutes: number;
}

interface DBUser {
  id: string;
  username: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DBFeedback {
  id: string;
  type: string;
  title: string;
  description: string;
  image_url: string | null;
  status: string;
  created_at: string;
  username: string;
}

const STORAGE_KEY = 'stc_settings';

function loadSettings(): Thresholds {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { monitorOfflineMinutes: raw.monitorOfflineMinutes ?? raw.agentOfflineMinutes ?? 10 };
  } catch { return { monitorOfflineMinutes: 10 }; }
}

const Settings = () => {
  const { role: currentUserRole, userId: currentUserId } = useAuth();
  const saved = loadSettings();
  
  const [thresholds, setThresholds] = useState<Thresholds>({
    monitorOfflineMinutes: saved.monitorOfflineMinutes,
  });
  const [smtp, setSmtp]     = useState({ host: '', port: '587', user: '', pass: '', from: '' });
  const [savedOk, setSavedOk] = useState(false);

  // Estados de gestión de usuarios
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Estado para creación de usuario
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [showPassword, setShowPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Estado para restablecer contraseña
  const [resettingUser, setResettingUser] = useState<DBUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Estados de feedback
  const [feedbacks, setFeedbacks] = useState<DBFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);

  const isAdmin = currentUserRole === 'admin';

  // Cargar usuarios si es administrador
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

  const fetchFeedbacks = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingFeedbacks(true);
    try {
      const data = await api.get<DBFeedback[]>('/feedback');
      setFeedbacks(data);
    } catch (err: unknown) {
      console.error('Error al obtener feedback', err);
    } finally {
      setLoadingFeedbacks(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    // Avoid synchronous setState in effect to satisfy ESLint
    const init = async () => {
      await fetchUsers();
      await fetchFeedbacks();
    };
    void init();
  }, [fetchUsers, fetchFeedbacks]);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
  };

  // Crear un operador/usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api.post('/portal/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      fetchUsers();
    } catch (err: unknown) {
      setCreateError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al crear usuario');
    } finally {
      setCreateLoading(false);
    }
  };

  // Cambiar estado activo/inactivo del usuario
  const toggleUserActive = async (user: DBUser) => {
    if (user.id === currentUserId) {
      alert("No puedes desactivar tu propio usuario.");
      return;
    }
    try {
      await api.put(`/portal/users/${user.id}`, {
        active: !user.active,
      });
      fetchUsers();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar estado del usuario');
    }
  };

  // Cambiar rol de usuario
  const handleRoleChange = async (user: DBUser, role: string) => {
    if (user.id === currentUserId) {
      alert("No puedes cambiar tu propio rol.");
      return;
    }
    try {
      await api.put(`/portal/users/${user.id}`, { role });
      fetchUsers();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar rol');
    }
  };

  const updateFeedbackStatus = async (id: string, status: string) => {
    try {
      await api.put(`/feedback/${id}/status`, { status });
      fetchFeedbacks();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar estado de feedback');
    }
  };

  // Restablecer contraseña
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !resetPassword) return;
    setResetLoading(true);
    setResetError(null);
    try {
      await api.put(`/portal/users/${resettingUser.id}`, {
        password: resetPassword,
      });
      setResettingUser(null);
      setResetPassword('');
      alert("Contraseña actualizada con éxito");
    } catch (err: unknown) {
      setResetError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar contraseña');
    } finally {
      setResetLoading(false);
    }
  };

  // Eliminar usuario
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
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1 font-medium">Gestión de umbrales, alertas, parámetros globales y operadores.</p>
      </header>

      {/* Monitor threshold */}
      <div className="cd-panel p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-50 text-brand rounded-2xl">
            <Bell size={24} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Monitoreo de Estado</h3>
            <p className="text-xs text-slate-500 font-medium">Define cuándo un monitor se considera fuera de línea.</p>
          </div>
        </div>

        <div className="max-w-md bg-slate-50/50 p-6 rounded-2xl border border-slate-50">
          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1 block mb-2">
            Tiempo de Inactividad (Minutos)
          </label>
          <div className="relative">
            <Radio size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="number"
              min={1}
              value={thresholds.monitorOfflineMinutes}
              onChange={e => setThresholds({ monitorOfflineMinutes: Number(e.target.value) })}
              className="cd-input w-full !pl-12 !bg-white border-transparent focus:!border-brand"
              placeholder=""
            />
          </div>
          <div className="mt-4 flex items-start gap-2 px-1">
            <Shield size={12} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Si el sistema no recibe un "heartbeat" del monitor durante este intervalo, 
              se disparará automáticamente el estado <span className="text-rose-500 font-bold uppercase tracking-tighter">Offline</span>.
            </p>
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="cd-panel p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-brand rounded-2xl">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1a2333]">Notificaciones por Correo</h3>
              <p className="text-xs text-slate-500 font-medium">Configuración técnica del servidor de salida (SMTP).</p>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-500 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest">
            Referencia Técnica
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { label: 'Servidor SMTP', key: 'host', icon: SettingsIcon },
            { label: 'Puerto',        key: 'port', icon: SettingsIcon },
            { label: 'Usuario',       key: 'user', icon: Mail },
            { label: 'Contraseña',    key: 'pass', type: 'password', icon: Shield },
            { label: 'Remitente',     key: 'from', icon: User },
          ].map(({ label, key, type, icon: Icon }) => (
            <div key={key} className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">{label}</label>
              <div className="relative">
                {Icon && <Icon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />}
                <input
                  type={type || 'text'}
                  value={smtp[key as keyof typeof smtp]}
                  onChange={e => setSmtp(p => ({ ...p, [key]: e.target.value }))}
                  placeholder=""
                  className="cd-input w-full !pl-10 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand"
                  disabled
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex items-start gap-4 shadow-sm">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Shield size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              <strong className="text-slate-700">Nota de seguridad:</strong> Las credenciales SMTP reales se gestionan exclusivamente 
              a través del archivo <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-brand font-mono font-bold">.env</code> del servidor. 
              Este formulario es una herramienta de visualización para administradores.
            </p>
          </div>
        </div>
      </div>

      {/* GESTIÓN DE OPERADORES (SOPORTE MULTI-USUARIO) */}
      <div className="cd-panel p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-brand rounded-2xl">
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
              className="flex items-center gap-2 bg-brand hover:bg-[#2471a3] text-white px-5 py-2.5 rounded-2xl text-xs font-extrabold shadow-md hover:shadow-lg transition-all"
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
              <div className="overflow-x-auto rounded-3xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Operador</th>
                      <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Rol</th>
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
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            disabled={u.id === currentUserId}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <option value="operator">Operador</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleUserActive(u)}
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
                              onClick={() => setResettingUser(u)}
                              title="Restablecer Contraseña"
                              className="p-2 text-slate-400 hover:text-brand hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Key size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
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
            )}
          </div>
        )}
      </div>

      {/* GESTIÓN DE FEEDBACK */}
      {isAdmin && (
        <div className="cd-panel p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-blue-50 text-brand rounded-2xl">
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1a2333]">Sugerencias y Reportes</h3>
              <p className="text-xs text-slate-500 font-medium">Bugs y mejoras reportados por los usuarios.</p>
            </div>
          </div>

          {loadingFeedbacks ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm font-medium border border-dashed border-slate-200 rounded-3xl">
              No hay reportes de feedback todavía.
            </div>
          ) : (
            <div className="space-y-4">
              {feedbacks.map(fb => {
                const isExpanded = expandedFeedbackId === fb.id;
                return (
                  <div key={fb.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden transition-all hover:shadow-md">
                    {/* Header del card */}
                    <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => setExpandedFeedbackId(isExpanded ? null : fb.id)}>
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl text-white ${fb.type === 'bug' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-[#004a99] shadow-blue-500/20'} shadow-lg`}>
                          <MessageSquare size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-extrabold text-slate-800">{fb.title}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Por {fb.username}</span>
                          </div>
                          <div className="text-xs font-medium text-slate-500 mt-0.5">
                            {new Date(fb.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <select
                          value={fb.status}
                          onClick={e => e.stopPropagation()}
                          onChange={(e) => updateFeedbackStatus(fb.id, e.target.value)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-colors ${
                            fb.status === 'open' ? 'bg-amber-50 text-amber-700 border-amber-200 focus:border-amber-400' :
                            fb.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200 focus:border-blue-400' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200 focus:border-emerald-400'
                          }`}
                        >
                          <option value="open">Abierto</option>
                          <option value="in_progress">En Progreso</option>
                          <option value="closed">Cerrado</option>
                        </select>
                        
                        <div className="text-slate-400 hover:text-slate-600">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>
                    </div>

                    {/* Cuerpo Expandible */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-slate-50 bg-slate-50/30 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                          {fb.description}
                        </div>
                        {fb.image_url && (
                          <div className="mt-4 border border-slate-200 rounded-2xl p-2 bg-white inline-block">
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <ImageIcon size={14} className="text-slate-400" />
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Captura adjunta</span>
                            </div>
                            <img src={fb.image_url} alt="Captura de pantalla" className="max-h-64 rounded-xl shadow-sm border border-slate-100" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GUARDAR CAMBIOS SMTP & UMBRAL */}
      <div className="flex items-center gap-6 pt-4">
        <button
          onClick={save}
          className="flex items-center gap-3 bg-brand hover:bg-[#2471a3] text-white px-10 py-5 rounded-[24px] text-sm font-extrabold shadow-xl shadow-blue-900/10 transition-all active:scale-95 group"
        >
          <Save size={18} className="group-hover:scale-110 transition-transform" />
          Guardar Cambios
        </button>
        
        {savedOk && (
          <span className="text-sm text-emerald-600 font-extrabold flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="p-1 bg-emerald-50 rounded-full">
              <CheckCircle size={16} />
            </div>
            Configuración actualizada con éxito
          </span>
        )}
      </div>

      {/* MODAL REGISTRAR OPERADOR */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 border border-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-50 text-brand rounded-2xl">
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
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Rol en el Portal</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { val: 'operator', title: 'Operador', desc: 'Soporte estándar' },
                    { val: 'admin', title: 'Administrador', desc: 'Control total' }
                  ].map(r => (
                    <button
                      key={r.val}
                      type="button"
                      onClick={() => setNewRole(r.val)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        newRole === r.val
                          ? 'border-brand bg-blue-50/30 ring-2 ring-brand/10'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-extrabold text-sm text-[#1a2333]">{r.title}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5 font-medium">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError(null);
                  }}
                  className="flex-1 px-5 py-4 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl text-xs font-extrabold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 px-5 py-4 bg-brand hover:bg-[#2471a3] text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {createLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESTABLECER CONTRASEÑA */}
      {resettingUser && (
        <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 border border-slate-100 shadow-2xl relative animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-50 text-brand rounded-2xl">
                <Key size={24} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1a2333]">Restablecer Contraseña</h3>
                <p className="text-xs text-slate-600 font-medium">Asigna una nueva clave para '{resettingUser.username}'.</p>
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
                  onClick={() => {
                    setResettingUser(null);
                    setResetPassword('');
                    setResetError(null);
                  }}
                  className="flex-1 px-5 py-4 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl text-xs font-extrabold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 px-5 py-4 bg-brand hover:bg-[#2471a3] text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {resetLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
