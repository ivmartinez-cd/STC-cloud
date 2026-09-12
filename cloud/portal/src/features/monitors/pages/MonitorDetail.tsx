import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../../store/AuthContext';
import { useMonitorDetail } from '../hooks/useMonitorDetail';
import { useMonitorStats, useMonitorConnectivity, useMonitorLicense, useMonitorActivity } from '../hooks/useMonitorOverview';
import { useTime } from '../../../shared/hooks/useTime';
import MonitorProfileCard from '../components/MonitorProfileCard';
import DetailTabs from '../../../shared/components/DetailTabs';
import DeviceSummaryCard from '../components/DeviceSummaryCard';
import MonitorSpecsCard from '../components/MonitorSpecsCard';
import LicenseCard from '../components/LicenseCard';
import ConnectivityStrip from '../components/ConnectivityStrip';
import RecentActivityCard from '../components/RecentActivityCard';
import DeviceInventoryTable from '../components/DeviceInventoryTable';
import ReportsTabPanel from '../components/ReportsTabPanel';
import RemoteToolsPanel from '../components/RemoteToolsPanel';
import ConfigTabPanel from '../components/ConfigTabPanel';
import SegmentsTabPanel from '../components/SegmentsTabPanel';
import MonitorRegenKeyModal from '../components/MonitorRegenKeyModal';
import Terminal from '../components/Terminal';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import { useToast } from '../../../store/ToastContext';

type Tab = 'overview' | 'devices' | 'console' | 'segments' | 'config' | 'reports';

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
    return (tab === 'overview' || tab === 'devices' || tab === 'console' || tab === 'segments' || tab === 'config' || tab === 'reports') ? tab : 'overview';
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

  // `replace`: cambiar de pestaña no debe apilar entradas en el historial (ver DeviceDetail).
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
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
        <div className="mx-auto max-w-xl rounded-[5px] border border-brand-chip-border bg-brand-soft p-12">
          <ShieldOff size={48} className="mx-auto mb-5 text-brand-severe" />
          <h2 className="mb-3.5 font-montserrat text-[19px] font-extrabold uppercase tracking-[.02em] text-ink-900">Nodo no encontrado</h2>
          <p className="mb-6 font-sans text-[13px] text-ink-700">{error || 'El agente solicitado no existe o no tienes permisos.'}</p>
          <Link to="/monitoring" className="inline-flex items-center gap-2.5 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
            <ArrowLeft size={16} /> Volver a Infraestructura
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
    // Segmentos IP aparte de Configuración: es lo único de la config que crece
    // con el cliente (59 rangos en un caso real) y necesita el ancho entero.
    ...(isReadOnlyViewer ? [] : [{ id: 'segments' as Tab, label: 'Segmentos' }, { id: 'config' as Tab, label: 'Configuración' }]),
  ];

  return (
    <div className="-m-4 flex min-w-0 flex-col gap-4 bg-surface-page px-[34px] pb-9 pt-[26px] short:gap-3 short:pb-4 short:pt-3 md:-m-10 md:h-full md:min-h-0">
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
        <DetailTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />
      </div>

      {/* Overview Tab */}
      {/* Cada tab llena el alto que deja la tarjeta de identidad (rediseño sin
          scroll, 27/08/2026): las listas dimensionan sus filas con useFitRows. */}
      {activeTab === 'overview' && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            <DeviceSummaryCard stats={stats} loading={statsLoading} error={statsError} onRetry={refetchStats} />
            <MonitorSpecsCard monitor={monitor} now={now} stats={stats} onViewDiagnostics={() => handleTabChange('reports')} />
            <LicenseCard monitor={monitor} license={license} loading={licenseLoading} error={licenseError} onRetry={refetchLicense} keyCopied={keyCopied} onCopyKey={copyKey} />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[1100px]:grid-cols-[1.55fr_1fr]">
            <ConnectivityStrip
              days={days} loading={daysLoading} error={daysError} onRetry={refetchDays}
              uptimePct={stats?.uptime_30d_pct ?? null} outages={stats?.outages_30d ?? null}
            />
            <RecentActivityCard
              events={events} loading={eventsLoading} error={eventsError} onRetry={refetchEvents}
              visible={!isReadOnlyViewer} onViewConsole={isReadOnlyViewer ? undefined : () => handleTabChange('console')}
            />
          </div>
        </div>
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

      {/* Console Tab — la terminal es el único bloque del portal que conserva
          scroll interno: es un log, recortarlo o paginarlo no tiene sentido. */}
      {activeTab === 'console' && !isReadOnlyViewer && (
        <div className="flex min-h-0 flex-1 flex-col">
          <RemoteToolsPanel commandLoading={commandLoading} onCommand={sendCommand} />
          <Terminal agentId={id ?? ''} />
          <div className="mt-4 flex items-start gap-3.5 rounded-[3px] border border-brand-chip-border bg-brand-soft p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[13px] font-bold text-white">!</span>
            <div>
              <p className="mb-1 font-montserrat text-[9px] font-bold uppercase tracking-[.13em] text-brand-accent">Aviso de seguridad</p>
              <p className="font-sans text-[12.5px] leading-[1.55] text-ink-700">
                Todos los comandos ejecutados en esta consola son auditados y vinculados a tu cuenta de usuario.
                Evitá comandos destructivos a menos que sea necesario para el soporte técnico.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <ReportsTabPanel devices={devices} monitor={monitor} />
      )}

      {/* Segments Tab */}
      {activeTab === 'segments' && !isReadOnlyViewer && (
        <SegmentsTabPanel monitor={monitor} onSave={saveConfig} />
      )}

      {/* Config Tab */}
      {activeTab === 'config' && !isReadOnlyViewer && (
        <ConfigTabPanel
          monitor={monitor} onSave={saveConfig} onSaveSnmpCredentials={saveSnmpCredentials}
          onRequestRevoke={() => setShowRevokeModal(true)} onOpenSegments={() => handleTabChange('segments')}
        />
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
