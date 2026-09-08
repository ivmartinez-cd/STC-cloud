import { useState } from 'react';
import PageHeader from '../../../shared/components/PageHeader';
import { BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { fmt } from '../../../shared/lib/formatters';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useActivityPage, type ActivityPageState } from '../hooks/useActivityPage';
import { exportActivityCsv } from '../lib/exportActivityCsv';
import ActivityByCategoryPanel from '../components/ActivityByCategoryPanel';
import ActivityFilterBar from '../components/ActivityFilterBar';
import ActivityTable from '../components/ActivityTable';
import ActivityPagination from '../components/ActivityPagination';

function subtitle(s: ActivityPageState['summary']): string {
  if (!s) return '';
  const others = s.total - (s.top_operator?.count ?? 0);
  return `${fmt(s.total)} eventos en el rango · ${fmt(s.top_operator?.count ?? 0)} de ${s.top_operator?.username ?? 'el operador principal'} · ${fmt(others)} de otros operadores`;
}

function hasActiveFilters(f: ActivityPageState['filters']): boolean {
  return !!f.q || f.segment !== 'all';
}

function clearFilters(f: ActivityPageState['filters']): void {
  f.setQ('');
  f.setSegment('all');
}

function Activity() {
  // La tabla intercala cabeceras de día: se descuentan 2 filas del cálculo.
  const fit = useFitRows({ estimate: 54, reserveRows: 2 });
  const s = useActivityPage(fit.rows);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try { await exportActivityCsv(s.filters, s.summary?.top_operator?.user_id ?? null); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="HISTORIAL DE ALTAS, BAJAS Y CAMBIOS DE CONFIGURACIÓN" title="Movimientos" subtitle={subtitle(s.summary)}
        actions={<button type="button" onClick={handleExport} disabled={exporting} className={BTN_SECONDARY_LG}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR CSV'}</button>}
      />

      <div className="mb-4 short:mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityByCategoryPanel byCategory={s.summary?.by_category ?? []} total={s.summary?.total ?? 0} loading={s.summaryLoading} error={s.summaryError} onRetry={s.fetchSummary} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <ActivityFilterBar filters={s.filters} />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <ActivityTable
            items={s.items} loading={s.loading} error={s.error}
            hasActiveFilters={hasActiveFilters(s.filters)} onRetry={s.fetchItems} onClearFilters={() => clearFilters(s.filters)}
            skeletonRows={fit.rows}
          />
        </div>
        <ActivityPagination page={s.page} total={s.total} totalPages={s.totalPages} pageSize={s.pageSize} onChange={s.setPage} />
      </div>
    </div>
  );
}

export default Activity;
