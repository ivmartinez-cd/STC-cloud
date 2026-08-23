import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, HardDrive, Activity, Clock,
  Settings, RefreshCw, Key, ShieldOff,
  AlertTriangle, Loader2, Copy,
  Command, Terminal as TerminalIcon, Download, BarChart2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMonitorDetail } from '../hooks/useMonitorDetail';
import { useTime } from '../hooks/useTime';
import { formatRelativeTime } from '../lib/formatters';
import MonitorSpecsCard from '../components/monitors/MonitorSpecsCard';
import DeviceSummaryCard from '../components/monitors/DeviceSummaryCard';
import LicenseCard from '../components/monitors/LicenseCard';
import DeviceInventoryTable from '../components/monitors/DeviceInventoryTable';
import ReportsTabPanel from '../components/monitors/ReportsTabPanel';
import SnmpCredentialsPanel from '../components/monitors/SnmpCredentialsPanel';
import IpRangesEditor from '../components/monitors/IpRangesEditor';
import RemoteToolsPanel from '../components/monitors/RemoteToolsPanel';
import Terminal from '../components/Terminal';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';
import type { EditFormData, MonitorData, SnmpCredentialInput } from '../types/monitor';
import { DEFAULT_BUSINESS_HOURS } from '../types/agents';

type Tab = 'overview' | 'devices' | 'console' | 'config' | 'reports';

const MonitorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { role } = useAuth();
  // El backend deniega (403) consola/config/logs para un client_viewer — ver
  // `rolePolicy.ts` (CLIENT_VIEWER_ROUTES no incluye `/agents/:id/config` ni
  // `/agents/:id/logs*`, y ninguna ruta de comando/revocación/regeneración).
  // Ocultar acá evita mandar esas requests y recibir un 403 en pantalla.
  const isReadOnlyViewer = role === 'client_viewer';
  const now = useTime(30000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get('tab');
    return (tab === 'overview' || tab === 'devices' || tab === 'console' || tab === 'config' || tab === 'reports') ? tab : 'overview';
  });
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const {
    monitor, devices, loading, error,
    commandLoading, sendCommand,
    saveConfig, saveSnmpCredentials, regenerateKey, revokeMonitor,
  } = useMonitorDetail(id!);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleRegen = async () => {
    try {
      const key = await regenerateKey();
      setRegenKey(key);
    } catch (err: unknown) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await revokeMonitor();
    } catch (err: unknown) {
      showToast((err as Error).message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  const copyKey = () => {
    if (!monitor?.activation_key) return;
    navigator.clipboard.writeText(monitor.activation_key);
    setKeyCopied(true);
    showToast('Llave copiada al portapapeles', 'success');
    setTimeout(() => setKeyCopied(false), 2000);
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

  const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Resumen',       icon: Activity },
    { id: 'devices',  label: 'Dispositivos',  icon: HardDrive },
    ...(isReadOnlyViewer ? [] : [{ id: 'console' as Tab, label: 'Consola', icon: TerminalIcon }]),
    { id: 'reports',  label: 'Reportes',      icon: BarChart2 },
    ...(isReadOnlyViewer ? [] : [{ id: 'config' as Tab, label: 'Configuración', icon: Settings }]),
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-4">
        <div className="space-y-4">
          <Link to="/monitoring" className="group flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-brand transition-all">
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Volver a Infraestructura
          </Link>
          <div className="flex items-center gap-6">
            <div className="p-5 bg-white shadow-xl shadow-brand/5 rounded-[28px] text-brand">
              <HardDrive size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-4xl font-black text-[#1a2333] tracking-tighter uppercase">{monitor.name}</h1>
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  monitor.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                  monitor.status === 'offline' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-slate-100 text-slate-500 border-slate-200'
                }`}>{monitor.status}</span>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} /> Último contacto: {formatRelativeTime(monitor.last_seen, now)}
              </p>
            </div>
          </div>
        </div>
        {!isReadOnlyViewer && (
          <div className="flex items-center gap-3">
            <button onClick={() => window.open(`/api/v1/agents/${id}/logs/export`, '_blank')}
              className="px-6 py-4 bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/5 hover:bg-emerald-50 transition-all active:scale-95 flex items-center gap-3">
              <Download size={18} /> Descargar Logs
            </button>
            <button onClick={() => handleTabChange('config')}
              className="px-6 py-4 bg-white text-[#1a2333] font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/5 hover:bg-slate-50 transition-all active:scale-95 flex items-center gap-3">
              <Settings size={18} /> Ajustes
            </button>
            <button onClick={handleRegen}
              className="px-6 py-4 bg-white text-amber-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/5 hover:bg-amber-50 transition-all active:scale-95 flex items-center gap-3">
              <RefreshCw size={18} /> Regenerar Llave
            </button>
            <button onClick={() => setShowRevokeModal(true)}
              className="px-6 py-4 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center gap-3">
              <ShieldOff size={18} /> Revocar
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100/50 p-1.5 rounded-[24px] w-fit">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button key={tabId} onClick={() => handleTabChange(tabId)}
            className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === tabId ? 'bg-white text-brand shadow-sm shadow-brand/5' : 'text-slate-400 hover:text-slate-600'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DeviceSummaryCard devices={devices} monitor={monitor} />
          <MonitorSpecsCard monitor={monitor} now={now} />
          <LicenseCard monitor={monitor} keyCopied={keyCopied} onCopyKey={copyKey} />
        </div>
      )}

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <DeviceInventoryTable
          devices={devices}
          monitorName={monitor.name}
          agentId={monitor.id}
          isReadOnlyViewer={isReadOnlyViewer}
        />
      )}

      {/* Console Tab */}
      {activeTab === 'console' && !isReadOnlyViewer && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-slate-900 text-white rounded-2xl"><Command size={24} /></div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight">Consola de STC Cloud</h3>
            </div>
            <RemoteToolsPanel commandLoading={commandLoading} onCommand={sendCommand} />
            <Terminal agentId={id ?? ''} />
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

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <ReportsTabPanel devices={devices} monitor={monitor} />
      )}

      {/* Config Tab */}
      {activeTab === 'config' && !isReadOnlyViewer && (
        <ConfigTabPanel monitor={monitor} onSave={saveConfig} onSaveSnmpCredentials={saveSnmpCredentials} />
      )}

      {/* Revoke Confirm */}
      <ConfirmModal
        isOpen={showRevokeModal}
        title="Revocar Licencia"
        message={`¿Estás seguro de que deseas revocar la licencia de ${monitor.name}? Esta acción desconectará el agente de forma permanente.`}
        confirmText="Revocar Ahora"
        onConfirm={handleRevoke}
        onClose={() => setShowRevokeModal(false)}
        isDanger={true}
        isLoading={revoking}
      />

      {/* Regen Key Modal */}
      {regenKey && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/70 backdrop-blur-md animate-overlay-in">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-modal-in border border-white/20">
            <header className="px-10 py-10 bg-gradient-to-r from-amber-500 to-orange-600 text-white relative overflow-hidden">
              <div className="relative z-10">
                <Key size={48} className="mb-4 text-amber-200" />
                <h2 className="text-2xl font-black tracking-tight uppercase">Nueva Llave Generada</h2>
                <p className="text-[10px] font-black text-amber-100 uppercase tracking-[0.2em] mt-1">Vínculo de seguridad actualizado</p>
              </div>
              <div className="absolute -right-10 -top-10 opacity-10"><RefreshCw size={160} /></div>
            </header>
            <div className="p-12 space-y-8">
              <p className="text-xs font-bold text-slate-500 leading-relaxed">
                Copia esta llave y pégala en la configuración del agente local para restablecer la comunicación.
              </p>
              <div className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-between gap-4">
                <code className="text-brand font-black text-lg tracking-wider break-all">{regenKey}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(regenKey); showToast('Nueva llave copiada', 'success'); }}
                  className="p-4 bg-white text-brand rounded-2xl shadow-md hover:bg-brand hover:text-white transition-all active:scale-90"
                >
                  <Copy size={20} />
                </button>
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
              <button onClick={() => setRegenKey(null)}
                className="w-full py-5 rounded-[24px] bg-[#1a2333] text-white font-black hover:bg-black transition-all shadow-xl shadow-slate-900/20 active:scale-95">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ConfigTabPanelProps {
  monitor: MonitorData;
  onSave: (form: EditFormData) => Promise<void>;
  onSaveSnmpCredentials: (credentials: SnmpCredentialInput[], expectedRev: number) => Promise<void>;
}

/** ISO weekday: 1=lunes..7=domingo — mismo convenio que `businessHours.days`. */
const WEEKDAY_LABELS = [
  { iso: 1, label: 'Lun' }, { iso: 2, label: 'Mar' }, { iso: 3, label: 'Mié' },
  { iso: 4, label: 'Jue' }, { iso: 5, label: 'Vie' }, { iso: 6, label: 'Sáb' }, { iso: 7, label: 'Dom' },
];

/** Sugerencias del `<datalist>` — el input acepta cualquier TZ IANA como texto libre. */
const COMMON_TIMEZONES = [
  'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Sao_Paulo', 'America/Bogota',
  'America/Lima', 'America/Mexico_City', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Toronto', 'Europe/Madrid', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Lisbon', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

const ConfigTabPanel = ({ monitor, onSave, onSaveSnmpCredentials }: ConfigTabPanelProps) => {
  const [form, setForm] = useState<EditFormData>(() => {
    let ranges = [];
    if (monitor.config?.ip_ranges) {
      ranges = typeof monitor.config.ip_ranges === 'string'
        ? JSON.parse(monitor.config.ip_ranges as unknown as string)
        : monitor.config.ip_ranges;
    }
    if (!Array.isArray(ranges) || ranges.length === 0) {
      ranges = [{ start: '', end: '' }];
    }

    return {
      name: monitor.name,
      ip_ranges: ranges,
      snmp: monitor.config?.snmp_community ?? 'public',
      tonerWarningThreshold: monitor.config?.toner_warning_threshold ?? 20,
      tonerCriticalThreshold: monitor.config?.toner_critical_threshold ?? 10,
      businessHours: monitor.config?.business_hours ?? DEFAULT_BUSINESS_HOURS,
    };
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const set = (key: keyof EditFormData, value: string | number) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.tonerCriticalThreshold >= form.tonerWarningThreshold) {
      showToast('El umbral crítico debe ser menor que el umbral de advertencia', 'error');
      return;
    }

    // Validación de forma en el cliente (mejor UX inmediata) — el cloud
    // re-valida formato/topes en serio al guardar (`validateIpRangeSpecs`).
    for (const r of form.ip_ranges) {
      const invalid = r.hostname !== undefined ? !r.hostname.trim()
        : r.cidr !== undefined ? !r.cidr.trim()
        : (!r.start?.trim() || !r.end?.trim());
      if (invalid) {
        showToast('Todos los rangos deben tener un CIDR, un hostname, o una IP de inicio y fin', 'warning');
        return;
      }
    }

    if (form.businessHours.days.length === 0) {
      showToast('El horario laboral requiere al menos un día', 'warning');
      return;
    }
    if (form.businessHours.start_hour >= form.businessHours.end_hour) {
      showToast('La hora de inicio del horario laboral debe ser menor que la de fin', 'warning');
      return;
    }

    setSaving(true);
    try {
      await onSave(form);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al actualizar configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Panel Izquierdo: Ajustes de Escaneo */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-brand/10 text-brand rounded-2xl">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Parámetros de Red</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Control de escaneo y conectividad</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Nodo</label>
            <input
              required type="text" value={form.name}
              className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
              onChange={e => set('name', e.target.value)}
            />
          </div>

          {/* IP Ranges Multi-List */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Segmentos IP Activos</label>
            <div className="max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
              <IpRangesEditor ranges={form.ip_ranges} onChange={ranges => setForm(f => ({ ...f, ip_ranges: ranges }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
              <input type="text" value={form.snmp}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                onChange={e => set('snmp', e.target.value)}
              />
            </div>
          </div>

        </div>

        {/* Panel Derecho: Umbrales de Tóner */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Umbrales de Consumibles</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Alertas automáticas de nivel de tóner</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Advertencia de Tóner Bajo (Warning)</label>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-black">{form.tonerWarningThreshold}%</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range" min="1" max="99" value={form.tonerWarningThreshold}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                onChange={e => set('tonerWarningThreshold', parseInt(e.target.value))}
              />
            </div>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed ml-1">
              Se creará una alerta amarilla cuando algún color de tóner sea menor o igual a este porcentaje.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nivel Crítico de Tóner (Critical)</label>
              <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-black">{form.tonerCriticalThreshold}%</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range" min="1" max="99" value={form.tonerCriticalThreshold}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                onChange={e => set('tonerCriticalThreshold', parseInt(e.target.value))}
              />
            </div>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed ml-1">
              Se creará una alerta roja y crítica cuando el nivel de tóner sea menor o igual a este porcentaje.
            </p>
          </div>

          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Comportamiento del Sensor</p>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                El sistema evalúa cada color de tóner de forma independiente. Las alertas se resuelven automáticamente de inmediato en cuanto los niveles suben (por ejemplo, después de un cambio de cartucho).
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-6 lg:col-span-2">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Clock size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Horario Laboral</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Define la frecuencia de escaneo según día/hora y zona horaria del sitio</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Zona horaria (IANA)</label>
              <input
                type="text" list="tz-datalist" value={form.businessHours.timezone}
                onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, timezone: e.target.value } }))}
                className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono !text-xs"
              />
              <datalist id="tz-datalist">
                {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz} />)}
              </datalist>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Horario (hora local)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} max={23} value={form.businessHours.start_hour}
                  onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, start_hour: parseInt(e.target.value, 10) || 0 } }))}
                  className="cd-input w-full !h-12 !text-xs font-mono !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                />
                <span className="text-slate-300 font-black">—</span>
                <input
                  type="number" min={1} max={24} value={form.businessHours.end_hour}
                  onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, end_hour: parseInt(e.target.value, 10) || 1 } }))}
                  className="cd-input w-full !h-12 !text-xs font-mono !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Días laborables</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map(({ iso, label }) => {
                const active = form.businessHours.days.includes(iso);
                return (
                  <button
                    key={iso} type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      businessHours: {
                        ...f.businessHours,
                        days: active ? f.businessHours.days.filter(d => d !== iso) : [...f.businessHours.days, iso].sort((a, b) => a - b),
                      },
                    }))}
                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                      active ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SnmpCredentialsPanel
          credentials={monitor.config?.snmp_credentials ?? []}
          rev={monitor.config?.snmp_credentials_rev ?? 0}
          onSave={onSaveSnmpCredentials}
        />
      </div>

      {/* Botones de acción */}
      <div className="flex justify-end gap-4">
        <button
          type="submit" disabled={saving}
          className="px-8 py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-brand/20 flex items-center gap-3 disabled:opacity-50 hover:bg-brand/90 transition-all active:scale-95"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />} Guardar Cambios
        </button>
      </div>
    </form>
  );
};

export default MonitorDetail;
