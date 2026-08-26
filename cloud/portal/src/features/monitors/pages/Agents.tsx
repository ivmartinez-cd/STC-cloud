import { useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import { fmt } from '../../../shared/lib/formatters';
import { useAgentsDirectory } from '../hooks/useAgentsDirectory';
import { exportAgentsCsv } from '../lib/exportAgentsCsv';
import type { AgentDirectoryRow } from '../types/agentsDirectory';
import AgentsFleetMetricsStrip from '../components/agents/AgentsFleetMetricsStrip';
import AgentsSignalDistributionCard from '../components/agents/AgentsSignalDistributionCard';
import AgentsFilterBar from '../components/agents/AgentsFilterBar';
import AgentsDirectoryTable from '../components/agents/AgentsDirectoryTable';
import AgentsPagination from '../components/agents/AgentsPagination';
import ConfigAgentModal from '../components/agents/ConfigAgentModal';
import RegenKeyModal from '../components/agents/RegenKeyModal';

function formatSyncTime(d: Date): string {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Rediseño hifi "Salud de nodos" (handoff 25/08/2026): reemplaza `AgentTable.tsx`
 * (bugs que arregla: header duplicado entre página y tabla, chip único "SIN
 * SEÑAL" sin distinguir 6 min de 6 meses, columna GESTIÓN invisible hasta
 * hover). Listado paginado/filtrado/ordenado server-side (`GET
 * /agents/directory`) + tira de métricas (`GET /agents/summary`) + distribución
 * por antigüedad de señal (`GET /agents/signal-buckets`), aparte. */
const Agents = () => {
  const { showToast } = useToast();
  const dir = useAgentsDirectory();

  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date());
  const [exporting, setExporting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<{ id: string; name: string; remote_ews_enabled?: boolean } | null>(null);
  const [regenModal, setRegenModal] = useState<{ agentName: string; key: string; expiresAt: string } | null>(null);
  const [agentToRevoke, setAgentToRevoke] = useState<AgentDirectoryRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([dir.refetch(), dir.refetchSummary(), dir.refetchBuckets()]);
      setLastSyncAt(new Date());
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAgentsCsv(dir.effectiveQuery, dir.segment, dir.sortDir);
    } catch (err: unknown) {
      showToast('Error al exportar CSV: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setExporting(false);
    }
  };

  const regenerateKey = async (row: AgentDirectoryRow) => {
    try {
      const data = await api.post<{ key: string; expiresAt: string }>(`/agents/${row.id}/regenerate-key`, {});
      setRegenModal({ agentName: row.name, key: data.key, expiresAt: data.expiresAt });
      showToast('Nueva llave generada — válida por 24 h', 'success');
      await dir.refetch();
    } catch (e: unknown) {
      showToast('Error al regenerar: ' + (e as Error).message, 'error');
    }
  };

  const revokeAgent = async () => {
    if (!agentToRevoke) return;
    setRevoking(true);
    try {
      await api.post(`/agents/${agentToRevoke.id}/revoke`, {});
      showToast('Agente revocado correctamente', 'success');
      setAgentToRevoke(null);
      await Promise.all([dir.refetch(), dir.refetchSummary(), dir.refetchBuckets()]);
    } catch (e: unknown) {
      showToast('Error al revocar: ' + (e as Error).message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  const reportandoCount = dir.buckets?.buckets.find((b) => b.key === 'menos_1h')?.count ?? 0;
  const sinSenalCount = Math.max(0, (dir.summary?.agents_total ?? 0) - reportandoCount);
  const hasActiveFilters = dir.effectiveQuery !== '' || dir.segment !== 'todos';

  return (
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              SUPERVISIÓN EN TIEMPO REAL DE AGENTES REGISTRADOS
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold leading-[1.05] tracking-[-.018em] text-ink-900">
            Salud de nodos
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-[6px] rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
              <span className="block h-1.5 w-1.5 rounded-full bg-brand" /> ACTUALIZADO {formatSyncTime(lastSyncAt)}
            </span>
            <span className="font-sans text-[12.5px] text-ink-400">
              {fmt(dir.summary?.agents_total ?? 0)} nodos registrados · {fmt(reportandoCount)} reportando · {fmt(sinSenalCount)} sin señal
            </span>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button" onClick={handleExport} disabled={exporting}
            className="rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            {exporting ? 'EXPORTANDO…' : 'EXPORTAR'}
          </button>
          <button
            type="button" onClick={handleSync} disabled={syncing}
            className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            {syncing ? 'SINCRONIZANDO…' : 'SINCRONIZAR TODOS'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
        <AgentsFleetMetricsStrip summary={dir.summary} loading={dir.summaryLoading} error={dir.summaryError} onRetry={dir.refetchSummary} />
        <AgentsSignalDistributionCard data={dir.buckets} loading={dir.bucketsLoading} error={dir.bucketsError} onRetry={dir.refetchBuckets} />
      </div>

      <div className="rounded-[5px] border border-line-100 bg-white">
        <AgentsFilterBar query={dir.rawQuery} onQueryChange={dir.setRawQuery} segment={dir.segment} onSegmentChange={dir.setSegment} sortDir={dir.sortDir} />

        <AgentsDirectoryTable
          rows={dir.rows}
          loading={dir.loading}
          error={dir.error}
          onRetry={dir.refetch}
          sortDir={dir.sortDir}
          onToggleSort={dir.toggleSort}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={dir.clearFilters}
          openMenuId={openMenuId}
          onToggleMenu={(id) => setOpenMenuId((cur) => (cur === id ? null : id))}
          onCloseMenu={() => setOpenMenuId(null)}
          onConfig={(row) => setConfigModal({ id: row.id, name: row.name, remote_ews_enabled: row.remote_ews_enabled })}
          onRegen={regenerateKey}
          onRevoke={setAgentToRevoke}
        />

        {!dir.error && !dir.loading && (
          <AgentsPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} staleCount={dir.summary?.stale_over_6h ?? 0} onPageChange={dir.setPage} />
        )}
      </div>

      <ConfigAgentModal modal={configModal} onClose={() => setConfigModal(null)} />

      <RegenKeyModal modal={regenModal} onClose={() => setRegenModal(null)} />

      <ConfirmModal
        isOpen={!!agentToRevoke}
        onClose={() => setAgentToRevoke(null)}
        onConfirm={revokeAgent}
        title="Revocación de Licencia de Nodo"
        message={`¿Está completamente seguro de que desea revocar el acceso para "${agentToRevoke?.name}"? Este nodo dejará de reportar datos y perderá su vínculo de seguridad con el servidor de forma irreversible.`}
        confirmText="Confirmar Revocación"
        isDanger={true}
        isLoading={revoking}
      />
    </div>
  );
};

export default Agents;
