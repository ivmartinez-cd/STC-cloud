import { useState } from 'react';
import { useAuth } from '../../../store/AuthContext';
import PageHeader from '../../../shared/components/PageHeader';
import HifiPagination from '../../../shared/components/HifiPagination';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { fmt } from '../../../shared/lib/formatters';
import { useSuppliesPage } from '../hooks/useSuppliesPage';
import { PAGE_SIZE } from '../lib/suppliesPresentation';
import { exportSuppliesCsv } from '../lib/exportSuppliesCsv';
import SuppliesMetricsStrip from '../components/SuppliesMetricsStrip';
import SuppliesFilterBar from '../components/SuppliesFilterBar';
import SuppliesBulkBar from '../components/SuppliesBulkBar';
import SuppliesTable from '../components/SuppliesTable';

function subtitle(s: ReturnType<typeof useSuppliesPage>['summary']): string {
  if (!s) return '';
  return `${fmt(s.total)} ítems en toda la flota · ${fmt(s.criticalCount)} críticos y ${fmt(s.lowCount)} en nivel bajo requieren reposición`;
}

function HeaderActions({ s, exporting, onExport }: { s: ReturnType<typeof useSuppliesPage>; exporting: boolean; onExport: () => void }) {
  const criticalCount = s.summary?.criticalCount ?? 0;
  return (
    <>
      <button type="button" onClick={onExport} disabled={exporting} className={BTN_SECONDARY_LG}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR CSV'}</button>
      {criticalCount > 0 && (
        <button type="button" onClick={() => void s.generateAllCritical(s.filters.clientId)} disabled={s.busy} className={BTN_PRIMARY_LG}>
          {s.busy ? 'GENERANDO…' : `GENERAR PEDIDOS (${fmt(criticalCount)})`}
        </button>
      )}
    </>
  );
}

export default function Supplies() {
  const { role } = useAuth();
  // `POST /supply-requests` requiere admin/operator en la práctica (mismo scope
  // que SupplyRequests.tsx) — client_viewer ve la tabla pero no genera pedidos.
  const readOnly = role === 'client_viewer';
  const s = useSuppliesPage();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try { await exportSuppliesCsv(s.filters); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <PageHeader
        eyebrow="TÓNERES, TAMBORES Y KITS DE MANTENIMIENTO" title="Consumibles" subtitle={subtitle(s.summary)}
        actions={<HeaderActions s={s} exporting={exporting} onExport={handleExport} />}
      />

      <SuppliesMetricsStrip summary={s.summary} loading={s.summaryLoading} error={s.summaryError} onRetry={s.fetchSummary} />

      <div className="rounded-[5px] border border-line-100 bg-white">
        <SuppliesFilterBar
          query={s.filters.rawQuery} onQueryChange={s.filters.setRawQuery}
          clientId={s.filters.clientId} onClientIdChange={s.filters.setClientId}
          canFilterByClient={s.canFilterByClient} clients={s.clients}
          kind={s.filters.kind} onKindChange={s.filters.setKind}
          urgency={s.filters.urgency} onUrgencyChange={s.filters.setUrgency}
        />
        <SuppliesBulkBar count={s.rowSelection.count} busy={s.busy} onGenerate={() => void s.generateSelected()} onClear={s.rowSelection.clear} />
        <SuppliesTable items={s.items} readOnly={readOnly} selection={s.rowSelection} rowKey={s.rowKey} loading={s.loading} error={s.error} onRetry={s.fetchSupplies} />
        <HifiPagination page={s.filters.page} totalPages={s.totalPages} total={s.total} pageSize={PAGE_SIZE} itemLabel="ítems" onPageChange={s.filters.setPage} />
      </div>
    </div>
  );
}
