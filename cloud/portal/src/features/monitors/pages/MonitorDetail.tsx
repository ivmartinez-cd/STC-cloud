import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, HardDrive, Activity, Clock,
  Settings, RefreshCw, ShieldOff,
  AlertTriangle, Loader2,
  Command, Terminal as TerminalIcon, Download, BarChart2,
} from 'lucide-react';
import { useAuth } from '../../../store/AuthContext';
import { useMonitorDetail } from '../hooks/useMonitorDetail';
import { useTime } from '../../../shared/hooks/useTime';
import { formatRelativeTime } from '../../../shared/lib/formatters';
import MonitorSpecsCard from '../components/MonitorSpecsCard';
import DeviceSummaryCard from '../components/DeviceSummaryCard';
import LicenseCard from '../components/LicenseCard';
import DeviceInventoryTable from '../components/DeviceInventoryTable';
import ReportsTabPanel from '../components/ReportsTabPanel';
import RemoteToolsPanel from '../components/RemoteToolsPanel';
import ConfigTabPanel from '../components/ConfigTabPanel';
import MonitorRegenKeyModal from '../components/MonitorRegenKeyModal';
import Terminal from '../components/Terminal';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import { useToast } from '../../../store/ToastContext';

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
        <MonitorRegenKeyModal regenKey={regenKey} onClose={() => setRegenKey(null)} />
      )}
    </div>
  );
};

export default MonitorDetail;
