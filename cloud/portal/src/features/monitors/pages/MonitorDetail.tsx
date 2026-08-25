import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldOff, ArrowLeft, Command, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../store/AuthContext';
import { useMonitorDetail } from '../hooks/useMonitorDetail';
import { useMonitorStats, useMonitorConnectivity, useMonitorLicense, useMonitorActivity } from '../hooks/useMonitorOverview';
import { useTime } from '../../../shared/hooks/useTime';
import MonitorProfileCard from '../components/MonitorProfileCard';
import MonitorMetricsStrip from '../components/MonitorMetricsStrip';
import MonitorDetailTabs from '../components/MonitorDetailTabs';
import DeviceSummaryCard from '../components/DeviceSummaryCard';
import MonitorSpecsCard from '../components/MonitorSpecsCard';
import LicenseCard from '../components/LicenseCard';
import ConnectivityStrip from '../components/ConnectivityStrip';
import RecentActivityCard from '../components/RecentActivityCard';
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
  // El backend deniega (403) consola/config/logs/actividad para un client_viewer —
  // ver `rolePolicy.ts` (CLIENT_VIEWER_ROUTES no incluye `/agents/:id/config`,
  // `/agents/:id/logs*` ni `/agents/:id/activity`). Ocultar acá evita mandar esas
  // requests y recibir un 403 en pantalla.
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
    syncing, syncNow, refetch,
  } = useMonitorDetail(id!);

  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useMonitorStats(id!);
  const { days, loading: daysLoading, error: daysError, refetch: refetchDays } = useMonitorConnectivity(id!);
  const { license, loading: licenseLoading, error: licenseError, refetch: refetchLicense } = useMonitorLicense(id!);
  const { events, loading: eventsLoading, error: eventsError, refetch: refetchEvents } = useMonitorActivity(id!, !isReadOnlyViewer);

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

  const handleSync = async () => {
    await syncNow();
    refetchStats();
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface-page">
        <Loader2 className="animate-spin text-brand mb-6" size={40} />
        <p className="text-ink-300 font-bold uppercase tracking-[0.3em] text-[10px]">Cargando monitor…</p>
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

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Resumen' },
    { id: 'devices', label: 'Dispositivos' },
    ...(isReadOnlyViewer ? [] : [{ id: 'console' as Tab, label: 'Consola' }]),
    { id: 'reports', label: 'Reportes' },
    ...(isReadOnlyViewer ? [] : [{ id: 'config' as Tab, label: 'Configuración' }]),
  ];

  return (
    <div className="-m-4 min-w-0 flex flex-col gap-4 bg-surface-page px-[34px] pb-9 pt-[26px] md:-m-10">
      <nav className="mb-1 flex items-center gap-2 font-sans text-xs">
        <Link to="/monitoring" className="font-semibold text-brand-accent hover:underline">Clientes</Link>
        <span className="text-ink-sep-light">/</span>
        <Link to={`/clients/${monitor.client_id}`} className="font-semibold text-brand-accent hover:underline">{monitor.client_name}</Link>
        <span className="text-ink-sep-light">/</span>
        <Link to={`/clients/${monitor.client_id}`} className="font-semibold text-brand-accent hover:underline">Infraestructura</Link>
        <span className="text-ink-sep-light">/</span>
        <span className="text-ink-700">{monitor.name}</span>
      </nav>

      <div className="rounded-[5px] border border-line-100 bg-white">
        <MonitorProfileCard
          monitor={monitor} now={now} isReadOnlyViewer={isReadOnlyViewer}
          syncing={syncing} onSync={handleSync}
          onDownloadLogs={() => window.open(`/api/v1/agents/${id}/logs/export`, '_blank')}
          onOpenSettings={() => handleTabChange('config')}
          onRegenKey={handleRegen}
        />
        <MonitorMetricsStrip stats={stats} loading={statsLoading} error={statsError} onRetry={refetchStats} />
        <MonitorDetailTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            <DeviceSummaryCard stats={stats} loading={statsLoading} error={statsError} onRetry={refetchStats} />
            <MonitorSpecsCard monitor={monitor} now={now} stats={stats} onViewDiagnostics={() => handleTabChange('reports')} />
            <LicenseCard monitor={monitor} license={license} loading={licenseLoading} error={licenseError} onRetry={refetchLicense} keyCopied={keyCopied} onCopyKey={copyKey} />
          </div>

          <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.55fr_1fr]">
            <ConnectivityStrip
              days={days} loading={daysLoading} error={daysError} onRetry={refetchDays}
              uptimePct={stats?.uptime_30d_pct ?? null} outages={stats?.outages_30d ?? null}
            />
            <RecentActivityCard
              events={events} loading={eventsLoading} error={eventsError} onRetry={refetchEvents}
              visible={!isReadOnlyViewer} onViewConsole={isReadOnlyViewer ? undefined : () => handleTabChange('console')}
            />
          </div>
        </>
      )}

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <DeviceInventoryTable
          devices={devices}
          monitorName={monitor.name}
          agentId={monitor.id}
          clientId={monitor.client_id}
          pendingCount={stats?.discovered_pending ?? 0}
          active={activeTab === 'devices'}
          onRefresh={() => { refetch(); refetchStats(); }}
          isReadOnlyViewer={isReadOnlyViewer}
        />
      )}

      {/* Console Tab */}
      {activeTab === 'console' && !isReadOnlyViewer && (
        <div className="space-y-6">
          <div className="rounded-[5px] border border-line-100 bg-white p-8">
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
        <ConfigTabPanel monitor={monitor} onSave={saveConfig} onSaveSnmpCredentials={saveSnmpCredentials} onRequestRevoke={() => setShowRevokeModal(true)} />
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
