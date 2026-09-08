import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { useAuth } from '../../../store/AuthContext';
import { fmt } from '../../../shared/lib/formatters';
import { useClientsDirectory } from '../hooks/useClientsDirectory';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { exportClientsCsv } from '../lib/exportClientsCsv';
import ClientsFilterBar from '../components/ClientsFilterBar';
import ClientsDirectoryTable from '../components/ClientsDirectoryTable';
import ClientsPagination from '../components/ClientsPagination';

/** Rediseño hifi "Clientes" (handoff 25/08/2026): listado paginado/filtrado/
 * ordenado server-side, con estado operativo, alertas abiertas y último reporte
 * derivados en el servidor (`GET /clients/directory`) + tira de métricas de
 * cartera aparte (`GET /clients/summary`). Área de contenido únicamente —
 * sidebar/topbar son de `app/layout/` y no se tocan acá. */
const Clients = () => {
  const { showToast } = useToast();
  const { role } = useAuth();
  const fit = useFitRows({ estimate: 54 });
  const dir = useClientsDirectory(fit.rows);

  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [formData, setFormData] = useState({ name: '', contact_name: '', contact_phone: '', contact_email: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/clients', formData);
      showToast('Cliente creado exitosamente', 'success');
      setShowModal(false);
      setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '' });
      void dir.refetch();
      void dir.refetchSummary();
    } catch (err: unknown) {
      showToast('Error al crear cliente: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportClientsCsv(dir.effectiveQuery, dir.segment, dir.sortField, dir.sortDir);
    } catch (err: unknown) {
      showToast('Error al exportar CSV: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = dir.effectiveQuery !== '' || dir.segment !== 'todos';

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <div className="mb-[22px] flex flex-wrap items-end short:mb-3 justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3 short:mb-1.5">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              RED DE MONITOREO · CARTERA DE CLIENTES
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold short:text-[26px] leading-[1.05] tracking-[-.018em] text-ink-900">
            Clientes
          </h1>
          {dir.summary && (
            <p className="mt-2.5 font-sans text-[12.5px] text-ink-400">
              {fmt(dir.summary.clients_total)} empresas · {fmt(dir.summary.devices_total)} dispositivos gestionados · {fmt(dir.summary.monitors_total)} monitores instalados
            </p>
          )}
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            {exporting ? 'EXPORTANDO…' : 'EXPORTAR CSV'}
          </button>
          {role !== 'client_viewer' && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            >
              + NUEVO CLIENTE
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <ClientsFilterBar
          query={dir.rawQuery}
          onQueryChange={dir.setRawQuery}
          segment={dir.segment}
          onSegmentChange={dir.setSegment}
          sortField={dir.sortField}
          sortDir={dir.sortDir}
        />

        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <ClientsDirectoryTable
            rows={dir.rows}
            loading={dir.loading}
            error={dir.error}
            onRetry={dir.refetch}
            maxDeviceCount={dir.maxDeviceCountOnPage}
            sortField={dir.sortField}
            sortDir={dir.sortDir}
            onToggleSort={dir.toggleSort}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={dir.clearFilters}
            skeletonRows={fit.rows}
          />
        </div>

        {!dir.error && !dir.loading && (
          <ClientsPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} pageSize={dir.pageSize} onPageChange={dir.setPage} />
        )}
      </div>

      {/* Modal de alta de cliente — comportamiento existente, sólo se toca el trigger. */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(20,20,20,.55)' }}>
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[5px] bg-white" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
              <div>
                <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Nuevo cliente</h2>
                <p className="mt-0.5 font-sans text-[12px] text-ink-300">Registro de empresa</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nombre de la empresa *</label>
                <input
                  required type="text"
                  className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Contacto principal</label>
                <input
                  type="text" placeholder="Nombre y apellido"
                  className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
                  value={formData.contact_name}
                  onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Teléfono</label>
                  <input
                    type="tel" placeholder="+54 11 ..."
                    className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[13px] text-ink-900 outline-none focus:border-brand"
                    value={formData.contact_phone}
                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Email corporativo</label>
                  <input
                    type="email" placeholder="email@empresa.com"
                    className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
                    value={formData.contact_email}
                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={isSubmitting}
                  className="flex items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />} Registrar cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
