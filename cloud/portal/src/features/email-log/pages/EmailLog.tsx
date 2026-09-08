import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader';
import HifiPagination from '../../../shared/components/HifiPagination';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useEmailLogPage } from '../hooks/useEmailLogPage';
import { exportEmailLogCsv } from '../lib/exportEmailLogCsv';
import EmailLogBanner from '../components/EmailLogBanner';
import EmailLogFilterBar from '../components/EmailLogFilterBar';
import EmailLogTable from '../components/EmailLogTable';

/** Auditoría de correo (handoff hifi #3, 26/08/2026) — registra correctamente
 * que ningún email se entrega, pero antes lo presentaba como 1.284 filas
 * sueltas sin decir por qué. El banner + la tira de métricas son el
 * diagnóstico; la tabla queda para el detalle fila por fila. */
export default function EmailLog() {
  const fit = useFitRows({ estimate: 54 });
  const s = useEmailLogPage(fit.rows);
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try { await exportEmailLogCsv(s.filters.query, s.filters.status, s.nameOf); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="AUDITORÍA DE EMAILS DE NOTIFICACIÓN" title="Correo"
        subtitle="Cada intento queda registrado, se haya enviado o no. Si un aviso no llegó, acá está el motivo exacto."
        actions={
          <>
            <button type="button" onClick={handleExport} disabled={exporting} className={BTN_SECONDARY_LG}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR'}</button>
            <button type="button" onClick={() => navigate('/settings')} className={BTN_PRIMARY_LG}>CONFIGURAR SMTP</button>
          </>
        }
      />

      <EmailLogBanner summary={s.summary} />

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <EmailLogFilterBar
          query={s.filters.rawQuery} onQueryChange={s.filters.setRawQuery}
          status={s.filters.status} onStatusChange={s.filters.setStatus}
        />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <EmailLogTable items={s.items} clientName={s.nameOf} loading={s.loading} error={s.error} onRetry={s.fetchRows} skeletonRows={fit.rows} />
        </div>
        <HifiPagination page={s.filters.page} totalPages={s.totalPages} total={s.total} pageSize={s.pageSize} itemLabel="intentos" onPageChange={s.filters.setPage} />
      </div>
    </div>
  );
}
