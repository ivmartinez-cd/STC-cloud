import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { useAuth } from '../../../store/AuthContext';
import { fmt } from '../../../shared/lib/formatters';
import { useClientsDirectory } from '../hooks/useClientsDirectory';
import { exportClientsCsv } from '../lib/exportClientsCsv';
import PortfolioMetricsStrip from '../components/PortfolioMetricsStrip';
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
  const dir = useClientsDirectory();

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
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              RED DE MONITOREO · CARTERA DE CLIENTES
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold leading-[1.05] tracking-[-.018em] text-ink-900">
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

      <PortfolioMetricsStrip
        summary={dir.summary}
        loading={dir.summaryLoading}
        error={dir.summaryError}
        onRetry={dir.refetchSummary}
      />

      <div className="rounded-[5px] border border-line-100 bg-white">
        <ClientsFilterBar
          query={dir.rawQuery}
          onQueryChange={dir.setRawQuery}
          segment={dir.segment}
          onSegmentChange={dir.setSegment}
          sortField={dir.sortField}
          sortDir={dir.sortDir}
        />

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
        />

        {!dir.error && !dir.loading && (
          <ClientsPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} onPageChange={dir.setPage} />
        )}
      </div>

      {/* Modal de alta de cliente — comportamiento existente, sólo se toca el trigger. */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-overlay-in">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-modal-in">
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-brand to-brand-gray text-white">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Nuevo Cliente</h2>
                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mt-1">Registro de empresa</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Nombre de la Empresa *</label>
                <input
                  required
                  type="text"
                  className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                  placeholder=""
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Contacto Principal</label>
                <input
                  type="text"
                  className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                  placeholder="Nombre y Apellido"
                  value={formData.contact_name}
                  onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                  <input
                    type="tel"
                    className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                    placeholder="+54 11 ..."
                    value={formData.contact_phone}
                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Email Corporativo</label>
                  <input
                    type="email"
                    className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                    placeholder="email@empresa.com"
                    value={formData.contact_email}
                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 rounded-xl bg-brand text-white font-extrabold hover:bg-brand-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-lg shadow-brand/20"
                >
                  {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : 'Registrar Cliente'}
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
