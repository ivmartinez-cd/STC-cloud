import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, HardDrive, Shield, Activity, Clock, Search, 
  Settings, RefreshCw, Key, ShieldOff, 
  Check, Copy, AlertTriangle, Loader2,
  Edit2, X, Cpu, Printer, Download, Zap
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime } from '../lib/formatters';
import ConfirmModal from '../components/ConfirmModal';

interface Device {
  id: string;
  name: string;
  ip_address: string;
  serial_number: string | null;
  last_seen: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  brand: string | null;
}

interface MonitorData {
  id: string;
  name: string;
  hardware_id: string | null;
  activation_key: string | null;
  status: 'pending' | 'active' | 'revoked' | 'offline';
  last_seen: string | null;
  client_id: string;
  client_name: string;
  config?: {
    ip_ranges: { start: string; end: string }[];
    snmp_community: string;
    scan_interval_minutes: number;
  };
}

const MonitorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'devices'>((searchParams.get('tab') as any) || 'overview');
  const [now, setNow] = useState(Date.now());
  
  // Monitoring State
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  
  // Modales
  const [showEditModal, setShowEditModal] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'devices'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'overview' | 'devices') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (activeTab === 'devices') {
      fetchDevices();
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await api.get<MonitorData>(`/agents/${id}`);
      setMonitor(data);
      await fetchDevices();
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos del monitor');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const data = await api.get<Device[]>(`/agents/${id}/devices`);
      setDevices(data);
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  };



  const sendCommand = async (action: string) => {
    if (!id) return;
    try {
      setCommandLoading(action);
      await api.post(`/agents/${id}/command`, { type: action, payload: {} });
      showToast(`Comando ${action} encolado correctamente`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al enviar comando', 'error');
    } finally {
      setCommandLoading(null);
    }
  };

  const copyKey = () => {
    if (monitor?.activation_key) {
      navigator.clipboard.writeText(monitor.activation_key);
      setKeyCopied(true);
      showToast('Llave copiada al portapapeles', 'success');
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleRegen = async () => {
    try {
      const data = await api.post<any>(`/agents/${id}/regenerate-key`);
      setRegenKey(data.activation_key);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRevoke = async () => {
    try {
      setRevoking(true);
      await api.post(`/agents/${id}/revoke`);
      showToast('Licencia revocada', 'success');
      navigate('/monitoring');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  if (loading && !monitor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f8fafc]">
        <Loader2 className="animate-spin text-brand mb-6" size={64} />
        <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">Cifrando Enlace...</p>
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="p-10 text-center">
        <div className="bg-rose-50 border border-rose-100 rounded-[32px] p-12 max-w-xl mx-auto">
          <ShieldOff size={64} className="text-rose-400 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-rose-900 mb-4 uppercase">Nodo No Encontrado</h2>
          <p className="text-rose-700 font-bold mb-8">{error || 'El agente solicitado no existe o no tienes permisos.'}</p>
          <Link to="/monitoring" className="cd-btn-primary inline-flex items-center gap-3">
            <ArrowLeft size={20} /> Volver a Infraestructura
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Premium */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-4">
        <div className="space-y-4">
          <Link to="/monitoring" className="group flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-brand transition-all">
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Volver a Infraestructura
          </Link>
          <div className="flex items-center gap-6">
            <div className="p-5 bg-white shadow-xl shadow-blue-900/5 rounded-[28px] text-brand">
              <HardDrive size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-4xl font-black text-[#1a2333] tracking-tighter uppercase">{monitor.name}</h1>
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  monitor.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                  monitor.status === 'offline' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {monitor.status}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} /> Último contacto: {formatRelativeTime(monitor.last_seen, now)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              window.open(`/api/v1/agents/${id}/logs/export`, '_blank');
            }}
            className="px-6 py-4 bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-emerald-50 transition-all active:scale-95 flex items-center gap-3"
          >
            <Download size={18} /> Descargar Logs
          </button>
          <button 
            onClick={() => setShowEditModal(true)}
            className="px-6 py-4 bg-white text-[#1a2333] font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-slate-50 transition-all active:scale-95 flex items-center gap-3"
          >
            <Settings size={18} /> Ajustes
          </button>
          <button 
            onClick={handleRegen}
            className="px-6 py-4 bg-white text-amber-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-amber-50 transition-all active:scale-95 flex items-center gap-3"
          >
            <RefreshCw size={18} /> Regenerar Llave
          </button>
          <button 
            onClick={() => setRevoking(true)}
            className="px-6 py-4 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center gap-3"
          >
            <ShieldOff size={18} /> Revocar
          </button>
        </div>
      </header>

      {/* Tabs Layout */}
      <div className="flex gap-1 bg-slate-100/50 p-1.5 rounded-[24px] w-fit">
        <button
          onClick={() => handleTabChange('overview')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'overview' 
              ? 'bg-white text-brand shadow-sm shadow-blue-900/5' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Resumen
        </button>
        <button
          onClick={() => handleTabChange('devices')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'devices' 
              ? 'bg-white text-brand shadow-sm shadow-blue-900/5' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Dispositivos
        </button>
      </div>

      {!loading && !error && monitor && activeTab === 'overview' && (
        <>
          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Device Overview */}
            <div className="lg:col-span-4 space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 group">
                <div className="bg-gradient-to-r from-brand to-[#3498db] px-6 py-4 flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    <HardDrive size={18} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Información Técnica</h3>
                  </div>
                  <Cpu size={20} className="opacity-20 group-hover:scale-110 transition-transform" />
                </div>
                <div className="p-8 space-y-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Hardware Identifier</label>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-xs font-bold text-slate-600 break-all leading-relaxed">
                      {monitor.hardware_id || 'SIN VINCULAR'}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pertenece a Cliente</label>
                    <Link to={`/clients/${monitor.client_id}`} className="block p-5 bg-blue-50 border border-blue-100 rounded-3xl group/client hover:bg-brand transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand font-black text-lg">
                          {monitor.client_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-brand group-hover/client:text-white transition-colors uppercase tracking-tight">{monitor.client_name}</p>
                          <p className="text-[9px] font-bold text-blue-400 group-hover/client:text-blue-100 transition-colors uppercase tracking-widest">Ver Expediente Completo</p>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="cd-panel p-8 space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                  <Activity size={16} className="text-brand" /> Estadísticas de Red
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                    <p className="text-2xl font-black text-[#1a2333] tracking-tighter mb-1">{devices.length}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Printers Activas</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col justify-center items-center">
                    <Printer size={24} className="text-brand/20 mb-2" />
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Infraestructura Verificada</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-6">
              <div className="cd-panel p-8 space-y-6 bg-gradient-to-br from-white to-slate-50/50">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-brand/10 text-brand rounded-2xl">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#1a2333] tracking-tight">Estado de Seguridad</h3>
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Verificación de enlace encriptado</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {monitor.activation_key ? (
                    <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[28px] flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-2xl shadow-sm text-emerald-600">
                          <Key size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Token de Sesión Pendiente</p>
                          <p className="font-mono text-xs font-bold text-emerald-900 truncate max-w-[200px] sm:max-w-md">{monitor.activation_key}</p>
                        </div>
                      </div>
                      <button 
                        onClick={copyKey} 
                        className="p-4 bg-white text-emerald-600 rounded-2xl shadow-md hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                      >
                        {keyCopied ? <Check size={20} /> : <Copy size={20} />}
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-[28px] flex items-center gap-4">
                      <div className="p-3 bg-white rounded-2xl shadow-sm text-brand">
                        <Check size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-brand uppercase tracking-widest">Nodo Vinculado Correctamente</p>
                        <p className="text-xs font-bold text-blue-900 leading-relaxed">
                          La comunicación está cifrada con el Hardware ID: <span className="font-mono">{monitor.hardware_id}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Último Latido</p>
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${monitor.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                        <span className="text-sm font-black text-slate-700">{formatRelativeTime(monitor.last_seen, now)}</span>
                      </div>
                    </div>
                    <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Comunidad SNMP</p>
                      <div className="flex items-center gap-3">
                        <Search size={16} className="text-brand" />
                        <span className="text-sm font-black text-slate-700">{monitor.config?.snmp_community || 'public'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de Administración Integradas */}
                  <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                      <Shield size={16} className="text-brand" /> Diagnóstico Remoto
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => sendCommand('RESCAN')}
                        disabled={!!commandLoading}
                        className="py-3 px-4 bg-white text-brand border border-blue-100 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand hover:text-white transition-all active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={commandLoading === 'RESCAN' ? 'animate-spin' : ''} /> Rescan
                      </button>
                      <button
                        onClick={() => sendCommand('PING')}
                        disabled={!!commandLoading}
                        className="py-3 px-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Activity size={14} className={commandLoading === 'PING' ? 'animate-spin' : ''} /> Ping
                      </button>
                      <button
                        onClick={() => sendCommand('RESTART')}
                        disabled={!!commandLoading}
                        className="py-3 px-4 bg-white text-rose-600 border border-rose-100 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Zap size={14} className={commandLoading === 'RESTART' ? 'animate-spin' : ''} /> Reiniciar
                      </button>
                    </div>
                     </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Devices Tab */}
      {!loading && !error && monitor && activeTab === 'devices' && (
        <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 animate-in slide-in-from-bottom-4 duration-500">
          <header className="px-8 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Parque de Impresión</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dispositivos descubiertos y monitorizados por este nodo</p>
            </div>
            <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest">
              {devices.length} Equipos
            </span>
          </header>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dispositivo</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Red</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Número de Serie</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Contadores (Total / Mono / Color)</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Último Reporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Printer size={48} className="text-slate-100" />
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No se han descubierto dispositivos en este segmento</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <Link to={`/devices/${device.id}`} className="flex items-center gap-4 group/item">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/item:bg-brand group-hover/item:text-white transition-all">
                            <Printer size={18} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-700 uppercase tracking-tight group-hover/item:text-brand transition-colors">{device.model || 'Modelo Genérico'}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{device.brand || 'Marca n/a'}</p>
                          </div>
                        </Link>
                      </td>

                      <td className="px-8 py-5">
                        <p className="text-xs font-bold text-brand font-mono">{device.ip_address}</p>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{device.serial_number || 'N/A'}</p>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-black text-slate-700">{(device.total_pages || 0).toLocaleString()}</span>
                          <div className="flex gap-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">M: {(device.mono_pages || 0).toLocaleString()}</span>
                            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">C: {(device.color_pages || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                          {formatRelativeTime(device.last_seen, now)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-overlay-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
            <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#2c3e50] text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black tracking-tight uppercase">Editar Nodo</h2>
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mt-1">Configuración del agente</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="relative z-10 p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90">
                <X size={28} />
              </button>
              <div className="absolute -right-10 -top-10 opacity-10">
                <Edit2 size={160} />
              </div>
            </header>
            <div className="p-12 space-y-8">
                <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Nodo</label>
                <input
                  type="text"
                  value={monitor?.name || ''}
                  className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                  placeholder="Ej: Servidor Central"
                  onChange={() => {}} 
                />
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowEditModal(false)} className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50">Cancelar</button>
                <button className="flex-1 py-5 bg-brand text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20">Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={revoking}
        title="Revocar Licencia"
        message={`¿Estás seguro de que deseas revocar la licencia de ${monitor?.name}? Esta acción desconectará el agente de forma permanente.`}
        confirmText="Revocar Ahora"
        onConfirm={handleRevoke}
        onClose={() => setRevoking(false)}
        isDanger={true}
        isLoading={revoking}
      />

      {regenKey && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/70 backdrop-blur-md animate-overlay-in">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-modal-in border border-white/20">
            <header className="px-10 py-10 bg-gradient-to-r from-amber-500 to-orange-600 text-white relative overflow-hidden">
              <div className="relative z-10">
                <Key size={48} className="mb-4 text-amber-200" />
                <h2 className="text-2xl font-black tracking-tight uppercase">Nueva Llave Generada</h2>
                <p className="text-[10px] font-black text-amber-100 uppercase tracking-[0.2em] mt-1">Vínculo de seguridad actualizado</p>
              </div>
              <div className="absolute -right-10 -top-10 opacity-10">
                <RefreshCw size={160} />
              </div>
            </header>
            <div className="p-12 space-y-8">
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  Copia esta llave y pégala en la configuración del agente local para restablecer la comunicación.
                </p>
                <div className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-between gap-4 group">
                  <code className="text-brand font-black text-lg tracking-wider break-all">{regenKey}</code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(regenKey || '');
                      showToast('Nueva llave copiada', 'success');
                    }}
                    className="p-4 bg-white text-brand rounded-2xl shadow-md hover:bg-brand hover:text-white transition-all active:scale-90"
                  >
                    <Copy size={20} />
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 flex gap-4">
                <AlertTriangle className="text-amber-600 shrink-0" size={24} />
                <div className="space-y-1">
                  <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Importante</p>
                  <p className="text-xs text-amber-800/70 font-bold leading-relaxed">
                    Esta llave expirará en 24 horas. Utilízala para reactivar el agente en el servidor del cliente. El agente anterior será desconectado automáticamente.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setRegenKey(null)}
                className="w-full py-5 rounded-[24px] bg-[#1a2333] text-white font-black hover:bg-black transition-all shadow-xl shadow-slate-900/20 active:scale-95"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitorDetail;
