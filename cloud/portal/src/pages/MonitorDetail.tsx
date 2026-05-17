import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, HardDrive, Activity, Clock,
  Settings, RefreshCw, Key, ShieldOff,
  AlertTriangle, Loader2, Copy,
  Command, Terminal as TerminalIcon, Download
} from 'lucide-react';
import { useMonitorDetail } from '../hooks/useMonitorDetail';
import { useTime } from '../hooks/useTime';
import { formatRelativeTime } from '../lib/formatters';
import MonitorSpecsCard from '../components/monitors/MonitorSpecsCard';
import DeviceSummaryCard from '../components/monitors/DeviceSummaryCard';
import LicenseCard from '../components/monitors/LicenseCard';
import DeviceInventoryTable from '../components/monitors/DeviceInventoryTable';
import RemoteToolsPanel from '../components/monitors/RemoteToolsPanel';
import EditMonitorModal from '../components/monitors/EditMonitorModal';
import Terminal from '../components/Terminal';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

type Tab = 'overview' | 'devices' | 'console';

const MonitorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const now = useTime(30000);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get('tab');
    return (tab === 'overview' || tab === 'devices' || tab === 'console') ? tab : 'overview';
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const {
    monitor, devices, loading, error,
    commandLoading, sendCommand,
    saveConfig, regenerateKey, revokeMonitor,
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
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'devices', label: 'Dispositivos', icon: HardDrive },
    { id: 'console', label: 'Consola', icon: TerminalIcon },
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
                }`}>{monitor.status}</span>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} /> Último contacto: {formatRelativeTime(monitor.last_seen, now)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.open(`/api/v1/agents/${id}/logs/export`, '_blank')}
            className="px-6 py-4 bg-white text-emerald-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-emerald-50 transition-all active:scale-95 flex items-center gap-3">
            <Download size={18} /> Descargar Logs
          </button>
          <button onClick={() => setShowEditModal(true)}
            className="px-6 py-4 bg-white text-[#1a2333] font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-slate-50 transition-all active:scale-95 flex items-center gap-3">
            <Settings size={18} /> Ajustes
          </button>
          <button onClick={handleRegen}
            className="px-6 py-4 bg-white text-amber-600 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-900/5 hover:bg-amber-50 transition-all active:scale-95 flex items-center gap-3">
            <RefreshCw size={18} /> Regenerar Llave
          </button>
          <button onClick={() => setShowRevokeModal(true)}
            className="px-6 py-4 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center gap-3">
            <ShieldOff size={18} /> Revocar
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100/50 p-1.5 rounded-[24px] w-fit">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button key={tabId} onClick={() => handleTabChange(tabId)}
            className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === tabId ? 'bg-white text-brand shadow-sm shadow-blue-900/5' : 'text-slate-400 hover:text-slate-600'
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
          monitorStatus={monitor.status}
          monitorLastSeen={monitor.last_seen}
        />
      )}

      {/* Console Tab */}
      {activeTab === 'console' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-blue-900/5">
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

      {/* Edit Modal */}
      <EditMonitorModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        monitor={monitor}
        onSave={saveConfig}
      />

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

export default MonitorDetail;
