import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import PageHeader from '../../../shared/components/PageHeader';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';
import { BTN_PRIMARY_LG } from '../../../shared/lib/buttons';
import ScheduledReportModal from '../components/ScheduledReportModal';
import ScheduledReportTemplates from '../components/ScheduledReportTemplates';
import { TemplatesToggle } from '../components/ScheduledReportTemplates';
import ScheduledReportsTable from '../components/ScheduledReportsTable';
import type { ReportTemplate, ScheduledReport } from '../types/scheduledReports';

interface ClientOption { id: string; name: string }

function useScheduledReportsData() {
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<ScheduledReport[]>('/scheduled-reports').then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get<ReportTemplate[]>('/scheduled-reports/templates').then(setTemplates).catch(() => setTemplates([]));
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [load]);

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? '…' : 'Toda la red');
  return { items, templates, clients, loading, load, clientName };
}

async function requestRunNow(r: ScheduledReport): Promise<string> {
  const res = await api.post<{ status: string; sent_to: string[] }>(`/scheduled-reports/${r.id}/run`);
  return res.sent_to.length ? `Informe enviado a ${res.sent_to.join(', ')}` : 'Informe generado (sin destinatarios)';
}

function useRunNow(load: () => void) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const runNow = async (r: ScheduledReport) => {
    setBusyId(r.id);
    try { showToast(await requestRunNow(r), 'success'); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error al ejecutar', 'error'); }
    finally { setBusyId(null); }
  };
  return { busyId, runNow };
}

function useRemoveDuplicate(load: () => void) {
  const { showToast } = useToast();

  const remove = async (r: ScheduledReport) => {
    if (!window.confirm(`¿Eliminar el informe "${r.name}"?`)) return;
    try { await api.delete(`/scheduled-reports/${r.id}`); showToast('Informe eliminado', 'success'); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error'); }
  };

  const duplicate = async (r: ScheduledReport) => {
    try { await api.post(`/scheduled-reports/${r.id}/duplicate`); showToast('Informe duplicado — la copia arranca pausada', 'success'); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error al duplicar', 'error'); }
  };

  return { remove, duplicate };
}

function useReportActions(load: () => void) {
  const { showToast } = useToast();
  const { busyId, runNow } = useRunNow(load);
  const { remove, duplicate } = useRemoveDuplicate(load);

  const togglePause = async (r: ScheduledReport) => {
    try {
      await api.put(`/scheduled-reports/${r.id}`, { enabled: !r.enabled });
      showToast(r.enabled ? 'Informe pausado' : 'Informe reanudado', 'success');
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al actualizar', 'error'); }
  };

  return { busyId, runNow, togglePause, remove, duplicate };
}

/** Callout de una sola línea (27/08/2026) — la versión de dos párrafos medía
 * 136px; título + texto truncado en una línea alcanza y deja alto a la tabla. */
function TemplateCallout() {
  return (
    <div className="mb-4 flex items-center gap-4 rounded-[5px] border border-line-100 bg-white px-5 py-3">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-brand-chip-border bg-brand-soft font-montserrat text-[14px] font-bold text-brand-accent">+</span>
      <div className="min-w-0 flex-1 truncate">
        <h2 className="m-0 inline font-montserrat text-[15px] font-extrabold tracking-[-.01em] text-ink-900">Empezá con una plantilla</h2>
        <span className="ml-3 font-sans text-[12.5px] text-ink-500">
          Elegí una de las plantillas de abajo o creá un informe desde cero — alcance, período, formato, frecuencia y destinatarios se pueden editar después.
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-[11px]">
      <span className="block h-0.5 w-5 bg-ink-500" />
      <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.19em] text-ink-400">{text}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

/**
 * Informes guardados/programados (Fase 4.1 del gap analysis vs HP SDS,
 * hifi #3 fase 5, 26/08/2026) — plantillas reales + tabla "Tus informes".
 * Sólo admin/operator (ruta protegida en App.tsx + deny-by-default backend).
 */
export default function ScheduledReports() {
  const data = useScheduledReportsData();
  const actions = useReportActions(data.load);
  const fit = useFitRows({ estimate: 54 });
  const paging = useClientPagination(data.items, fit.rows, 'page');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [template, setTemplate] = useState<ReportTemplate | null>(null);

  const openCreate = () => { setEditing(null); setTemplate(null); setModalOpen(true); };
  const openFromTemplate = (t: ReportTemplate) => { setEditing(null); setTemplate(t); setModalOpen(true); };
  const openEdit = (r: ScheduledReport) => { setEditing(r); setTemplate(null); setModalOpen(true); };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="INFORMES GUARDADOS Y PROGRAMADOS" title="Informes"
        subtitle={data.items.length === 0 ? 'Se generan solos según su frecuencia y llegan por email a los destinatarios definidos. Todavía no creaste ninguno.' : 'Se generan solos según su frecuencia y llegan por email a los destinatarios definidos.'}
        actions={<button type="button" onClick={openCreate} className={BTN_PRIMARY_LG}>+ NUEVO INFORME</button>}
      />

      <TemplateCallout />
      <SectionLabel text="PLANTILLAS DISPONIBLES" right={<TemplatesToggle total={data.templates.length} showAll={showAllTemplates} onToggle={() => setShowAllTemplates((v) => !v)} />} />
      <ScheduledReportTemplates templates={data.templates} showAll={showAllTemplates} onUse={openFromTemplate} />

      <SectionLabel text="TUS INFORMES" />
      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <ScheduledReportsTable
            items={paging.visible} loading={data.loading} clientName={data.clientName} busyId={actions.busyId} skeletonRows={fit.rows}
            onRun={actions.runNow} onTogglePause={actions.togglePause} onEdit={openEdit} onRemove={actions.remove} onDuplicate={actions.duplicate} onCreate={openCreate}
          />
        </div>
        {<HifiPagination page={paging.page} totalPages={paging.totalPages} total={paging.total} pageSize={paging.pageSize} itemLabel="informes" onPageChange={paging.setPage} />}
      </div>

      <ScheduledReportModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={data.load} clients={data.clients} editing={editing} initialTemplate={template} />
    </div>
  );
}
