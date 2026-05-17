import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, HardDrive, Shield, Activity, Clock,
  Settings, RefreshCw, Key, ShieldOff, 
  Check, Copy, AlertTriangle, Loader2,
  X, Printer, Download, Zap, Command, Terminal as TerminalIcon
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime } from '../lib/formatters';
import ConfirmModal from '../components/ConfirmModal';
import Terminal from '../components/Terminal';

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
  version?: string;
  host_name?: string;
  host_os?: string;
  host_ip?: string;
  uptime?: string;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'console'>(() => {
    const tab = searchParams.get('tab');
    return (tab === 'overview' || tab === 'devices' || tab === 'console') ? tab : 'overview';
  });
  const [now, setNow] = useState(Date.now());
  
  // Monitoring State
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  
  // Modales
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    ipStart: '',
    ipEnd: '',
    snmp: 'public',
    interval: 15
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await api.get<Device[]>(`/agents/${id}/devices`);
      setDevices(data);
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  }, [id]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<MonitorData>(`/agents/${id}`);
      setMonitor(data);
      await fetchDevices();
      setError(null);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Error al cargar datos del monitor');
    } finally {
      setLoading(false);
    }
  }, [id, fetchDevices]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [id, fetchData]);


  const handleTabChange = (tab: 'overview' | 'devices' | 'console') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (activeTab === 'devices') {
      fetchDevices();
    }
  }, [activeTab, fetchDevices]);




  const sendCommand = async (action: string) => {
    if (!id) return;
    try {
      setCommandLoading(action);
      await api.post(`/agents/${id}/command`, { type: action, payload: {} });
      showToast(`Comando ${action} encolado correctamente`, 'success');
    } catch (err: unknown) {
      const error = err as Error;
      showToast(error.message || 'Error al enviar comando', 'error');
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
      const data = await api.post<{ activation_key: string }>(`/agents/${id}/regenerate-key`);
      setRegenKey(data.activation_key);
      fetchData();
    } catch (err: unknown) {
      const error = err as Error;
      showToast(error.message, 'error');
    }
  };


  const handleRevoke = async () => {
    try {
      setRevoking(true);
      await api.post(`/agents/${id}/revoke`);
      showToast('Licencia revocada', 'success');
      navigate('/monitoring');
    } catch (err: unknown) {
      const error = err as Error;
      showToast(error.message, 'error');
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
            onClick={() => {
              const ranges = typeof monitor.config?.ip_ranges === 'string' 
                ? JSON.parse(monitor.config.ip_ranges) 
                : (monitor.config?.ip_ranges || []);
              
              const firstRange = ranges[0] || { start: '', end: '' };
              
              setEditForm({
                name: monitor.name,
                ipStart: firstRange.start,
                ipEnd: firstRange.end,
                snmp: monitor.config?.snmp_community || 'public',
                interval: monitor.config?.scan_interval_minutes || 15
              });
              setShowEditModal(true);
            }}
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
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
            activeTab === 'overview' 
              ? 'bg-white text-brand shadow-sm shadow-blue-900/5' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Activity size={14} />
          Resumen
        </button>
        <button
          onClick={() => handleTabChange('devices')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
            activeTab === 'devices' 
              ? 'bg-white text-brand shadow-sm shadow-blue-900/5' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <HardDrive size={14} />
          Dispositivos
        </button>
        <button
          onClick={() => handleTabChange('console')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
            activeTab === 'console' 
              ? 'bg-white text-brand shadow-sm shadow-blue-900/5' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <TerminalIcon size={14} />
          Consola
        </button>
      </div>

      {!loading && !error && monitor && activeTab === 'overview' && (
        <>
          {/* Main Dashboard Layout */}
          {/* Main Dashboard Layout (3 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Parque de Impresión (Dispositivos) */}
            <div className="space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 relative bg-white h-full">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                <div className="cd-header-blue flex items-center justify-between px-6 py-5">
                  <div className="flex items-center gap-3 text-white">
                    <Printer size={18} className="text-emerald-400" />
                    <span className="font-black uppercase tracking-widest text-sm text-white">Dispositivos</span>
                  </div>
                  <span className="text-[10px] font-bold text-white border border-white/30 bg-white/10 px-2 py-1 rounded-md shadow-sm">{devices.length} Total</span>
                </div>
                <div className="p-6 space-y-6">
                  {/* List Stats */}
                  <ul className="space-y-3">
                    <li className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500 uppercase tracking-widest">Activos</span>
                      <span className="font-black text-emerald-600 text-sm">{devices.length}</span>
                    </li>
                    <li className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500 uppercase tracking-widest">Offline / No Gestionados</span>
                      <span className="font-black text-slate-400 text-sm">0</span>
                    </li>
                    <li className="flex justify-between items-center text-xs pt-3 border-t border-slate-100">
                      <span className="font-black text-[#1a2333] uppercase tracking-widest">Total</span>
                      <span className="font-black text-brand text-lg">{devices.length}</span>
                    </li>
                  </ul>

                  {/* Visual Chart (Donut) */}
                  <div className="flex justify-center py-4">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background Circle */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                        {/* Active Circle (100% for now) */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12" strokeDasharray="251.2" strokeDashoffset={devices.length === 0 ? "251.2" : "0"} className="transition-all duration-1000 ease-out" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black text-[#1a2333]">{devices.length}</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Equipos</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Estado del Monitor (Información Técnica) */}
            <div className="space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 relative bg-white h-full">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand via-blue-400 to-indigo-500"></div>
                <div className="cd-header-blue flex items-center gap-3 px-6 py-5 text-white">
                  <TerminalIcon size={18} className="text-blue-300" />
                  <span className="font-black uppercase tracking-widest text-sm text-white">Estado del Monitor</span>
                </div>
                <div className="p-6">
                  <div className="bg-slate-50/80 rounded-3xl p-1 border border-slate-100/50">
                    <ul className="divide-y divide-slate-100/50">
                      <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aplicación Remota</span>
                        <span className="text-[11px] font-black text-[#1a2333]">STC Cloud Agent</span>
                      </li>
                      <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Versión</span>
                        <span className="text-[11px] font-black text-[#1a2333] px-2 py-0.5 bg-slate-100 rounded-md font-mono border border-slate-200">{monitor.version || 'v1.5.2-stable'}</span>
                      </li>
                      <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Estado</span>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${monitor.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                          <span className="text-[11px] font-black text-[#1a2333] uppercase">{monitor.status}</span>
                        </div>
                      </li>
                      <li className="flex flex-col gap-1 px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Nombre del Host</span>
                        <span className="text-[11px] font-black text-[#1a2333] tracking-tight">{monitor.host_name || 'NO DISPONIBLE'}</span>
                      </li>
                      <li className="flex flex-col gap-1 px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sistema Operativo</span>
                        <span className="text-[11px] font-black text-[#1a2333]">
                          {monitor.host_os || 'Windows (x64)'}
                        </span>
                      </li>
                      <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dirección IP</span>
                        <span className="text-[11px] font-black text-blue-600 font-mono tracking-tighter">{monitor.host_ip || '---.---.---.---'}</span>
                      </li>
                      <li className="flex justify-between items-center px-4 py-3.5 hover:bg-white rounded-2xl transition-all group">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Último Contacto</span>
                        <span className="text-[11px] font-bold text-slate-500">{formatRelativeTime(monitor.last_seen, now)}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Detalles de la Licencia & Seguridad */}
            <div className="space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 bg-white h-full relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
                <div className="cd-header-blue flex items-center gap-3 px-6 py-5 text-white">
                  <Shield size={18} className="text-amber-400" />
                  <span className="font-black uppercase tracking-widest text-sm text-white">Detalles de la Licencia</span>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* Client Info */}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Organización Vinculada</label>
                    <Link to={`/clients/${monitor.client_id}`} className="block p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl group hover:shadow-lg hover:shadow-blue-900/10 transition-all hover:-translate-y-0.5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-blue-500/10 transition-colors"></div>
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand font-black text-lg border border-blue-100/50 group-hover:scale-105 transition-transform">
                          {monitor.client_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-brand uppercase tracking-tight">{monitor.client_name}</p>
                          <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Ver Perfil &rarr;</p>
                        </div>
                      </div>
                    </Link>
                  </div>

                  {/* Hardware ID Block */}
                  <div className="group space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <HardDrive size={12} /> Hardware Identifier
                    </label>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group-hover:border-brand/30 transition-colors">
                      <span className="font-mono text-[10px] font-bold text-slate-700 break-all">
                        {monitor.hardware_id || 'SIN VINCULAR'}
                      </span>
                    </div>
                  </div>

                  {/* Activation Key Block */}
                  {monitor.activation_key ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-3xl group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <Key size={14} />
                          <p className="text-[9px] font-black uppercase tracking-widest">Clave de Activación</p>
                        </div>
                        <button onClick={copyKey} className="p-1.5 bg-white text-emerald-600 rounded-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90">
                          {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                      <p className="font-mono text-xs font-bold text-emerald-900 break-all bg-white/50 p-2 rounded-xl">{monitor.activation_key}</p>
                    </div>
                  ) : (
                    <div className="p-5 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-sm text-brand">
                        <Check size={16} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-brand uppercase tracking-widest">Enlace Cifrado</p>
                        <p className="text-[10px] font-bold text-blue-900 uppercase">Telemetría Activa</p>
                      </div>
                    </div>
                  )}
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
            <table className="cd-table">
              <thead>
                <tr>
                  <th className="!bg-[#004a99] !text-white !rounded-tl-2xl">Dispositivo</th>
                  <th className="!bg-[#004a99] !text-white">Red</th>
                  <th className="!bg-[#004a99] !text-white">Número de Serie</th>
                  <th className="!bg-[#004a99] !text-white !text-right !rounded-tr-2xl">Contadores (Total / Mono / Color)</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Printer size={48} className="text-slate-200" />
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No se han descubierto dispositivos en este segmento</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id} className="group hover:bg-slate-50/50 transition-all">
                      <td className="px-8 py-5">
                        <Link to={`/devices/${device.id}`} className="flex items-center gap-4 group/device">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover/device:bg-brand group-hover/device:text-white transition-all">
                            <Printer size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#1a2333] tracking-tight group-hover/device:text-brand transition-colors">{device.model || 'Modelo Genérico'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{device.brand || 'Marca n/a'}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-600 font-mono">{device.ip_address}</span>
                          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Conexión OK</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-mono text-xs font-bold border border-slate-200">
                          {device.serial_number || 'N/A'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-sm font-black text-[#1a2333] tabular-nums">
                            {(device.total_pages || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-bold uppercase">Total</span>
                          </p>
                          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            <span>{(device.mono_pages || 0).toLocaleString()} M</span>
                            <span className="w-1 h-1 bg-slate-200 rounded-full" />
                            <span className="text-brand">{(device.color_pages || 0).toLocaleString()} C</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Console Tab */}
      {!loading && !error && monitor && activeTab === 'console' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-blue-900/5">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-slate-900 text-white rounded-2xl">
                <Command size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#1a2333] tracking-tight">Consola de STC Cloud</h3>
              </div>
            </div>

            {/* Support Tools (STC CLOUD Style) - Moved here */}
            <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <Settings size={16} className="text-brand" />
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Herramientas de Soporte Remoto</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative group">
                  <button
                    onClick={() => sendCommand('RESCAN')}
                    className="w-full py-3 px-4 bg-white text-brand border border-blue-100 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand hover:text-white transition-all active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={commandLoading === 'RESCAN' ? 'animate-spin' : ''} /> Rescan
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700/50 translate-y-1 group-hover:translate-y-0">
                    Escanea la red local en busca de nuevos dispositivos
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    onClick={() => sendCommand('RESTART')}
                    className="w-full py-3 px-4 bg-white text-rose-600 border border-rose-100 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Zap size={14} className={commandLoading === 'RESTART' ? 'animate-spin' : ''} /> Reiniciar
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700/50 translate-y-1 group-hover:translate-y-0">
                    Reinicia el servicio del agente de forma remota
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                  </div>
                </div>
                <div className="relative group">
                  <button
                    onClick={() => sendCommand('FORCE_UPDATE')}
                    className="w-full py-3 px-4 bg-white text-emerald-600 border border-emerald-100 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download size={14} className={commandLoading === 'FORCE_UPDATE' ? 'animate-spin' : ''} /> Actualizar
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700/50 translate-y-1 group-hover:translate-y-0">
                    Fuerza la descarga e instalación de la última versión
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <Terminal agentId={id || ''} />
            
            <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Aviso de Seguridad</p>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                  Todos los comandos ejecutados en esta consola son auditados y vinculados a su cuenta de usuario. 
                  Evite comandos destructivos a menos que sea necesario para el soporte técnico.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-overlay-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
            <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#2c3e50] text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black tracking-tight uppercase">Configuración del Nodo</h2>
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mt-1">Ajustes técnicos de escaneo</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="relative z-10 p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90">
                <X size={28} />
              </button>
              <div className="absolute -right-10 -top-10 opacity-10">
                <Settings size={160} />
              </div>
            </header>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSettings(true);
                try {
                  await api.put(`/agents/${id}/config`, {
                    name: editForm.name,
                    ip_ranges: editForm.ipStart && editForm.ipEnd ? [{ start: editForm.ipStart, end: editForm.ipEnd }] : [],
                    snmp_community: editForm.snmp,
                    scan_interval_minutes: editForm.interval
                  });
                  showToast('Configuración actualizada correctamente', 'success');
                  setShowEditModal(false);
                  fetchData();
                } catch (err: unknown) {
                  const error = err as Error;
                  showToast(error.message || 'Error al actualizar configuración', 'error');
                } finally {
                  setSavingSettings(false);
                }
              }}
              className="p-12 space-y-8"
            >
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Nodo</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                  placeholder=""
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">IP Inicial</label>
                  <input
                    type="text"
                    value={editForm.ipStart}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                    placeholder=""
                    onChange={(e) => setEditForm({ ...editForm, ipStart: e.target.value })} 
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">IP Final</label>
                  <input
                    type="text"
                    value={editForm.ipEnd}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                    placeholder=""
                    onChange={(e) => setEditForm({ ...editForm, ipEnd: e.target.value })} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                  <input
                    type="text"
                    value={editForm.snmp}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                    placeholder=""
                    onChange={(e) => setEditForm({ ...editForm, snmp: e.target.value })} 
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Intervalo (Minutos)</label>
                  <select
                    value={editForm.interval}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                    onChange={(e) => setEditForm({ ...editForm, interval: parseInt(e.target.value) })}
                  >
                    <option value={15}>Cada 15 min</option>
                    <option value={30}>Cada 30 min</option>
                    <option value={60}>Cada 1 hora</option>
                    <option value={1440}>Cada 24 horas</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)} 
                  className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-5 bg-brand text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {savingSettings ? <Loader2 size={18} className="animate-spin" /> : 'Guardar Cambios'}
                </button>
              </div>
            </form>
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
