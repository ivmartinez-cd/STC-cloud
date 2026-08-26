import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import PageHeader from '../../../shared/components/PageHeader';
import { BTN_PRIMARY_LG } from '../../../shared/lib/buttons';
import ScheduledReportModal from '../components/ScheduledReportModal';
import ScheduledReportTemplates from '../components/ScheduledReportTemplates';
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

/**
 * Informes guardados/programados (Fase 4.1 del gap analysis vs HP SDS,
 * hifi #3 fase 5, 26/08/2026) — plantillas reales + tabla "Tus informes".
 * Sólo admin/operator (ruta protegida en App.tsx + deny-by-default backend).
 */
export default function ScheduledReports() {
  const data = useScheduledReportsData();
  const actions = useReportActions(data.load);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [template, setTemplate] = useState<ReportTemplate | null>(null);

  const openCreate = () => { setEditing(null); setTemplate(null); setModalOpen(true); };
  const openFromTemplate = (t: ReportTemplate) => { setEditing(null); setTemplate(t); setModalOpen(true); };
  const openEdit = (r: ScheduledReport) => { setEditing(r); setTemplate(null); setModalOpen(true); };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <PageHeader
        eyebrow="INFORMES GUARDADOS Y PROGRAMADOS" title="Informes"
        subtitle={data.items.length === 0 ? 'Se generan solos según su frecuencia y llegan por email a los destinatarios definidos. Todavía no creaste ninguno.' : 'Se generan solos según su frecuencia y llegan por email a los destinatarios definidos.'}
        actions={<button type="button" onClick={openCreate} className={BTN_PRIMARY_LG}>+ NUEVO INFORME</button>}
      />

      <div className="mb-6 flex items-start gap-4 rounded-[5px] border border-line-100 bg-white p-7">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[3px] border border-brand-chip-border bg-brand-soft font-montserrat text-[15px] font-bold text-brand-accent">+</span>
        <div>
          <h2 className="m-0 font-montserrat text-[19px] font-extrabold tracking-[-.01em] text-ink-900">Empezá con una plantilla</h2>
          <p className="mt-2 max-w-[80ch] font-sans text-[13px] leading-[1.6] text-ink-500">
            Elegí una de las plantillas de abajo o creá un informe desde cero. Cualquiera de ellas se puede editar después: alcance, período, formato, frecuencia y destinatarios.
          </p>
        </div>
      </div>

      <div className="mb-3.5 flex items-center gap-[11px]">
        <span className="block h-0.5 w-5 bg-ink-500" />
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.19em] text-ink-400">PLANTILLAS DISPONIBLES</span>
      </div>
      <ScheduledReportTemplates templates={data.templates} onUse={openFromTemplate} />

      <div className="mb-3.5 flex items-center gap-[11px]">
        <span className="block h-0.5 w-5 bg-ink-500" />
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.19em] text-ink-400">TUS INFORMES</span>
      </div>
      <ScheduledReportsTable
        items={data.items} loading={data.loading} clientName={data.clientName} busyId={actions.busyId}
        onRun={actions.runNow} onTogglePause={actions.togglePause} onEdit={openEdit} onRemove={actions.remove} onDuplicate={actions.duplicate} onCreate={openCreate}
      />

      <ScheduledReportModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={data.load} clients={data.clients} editing={editing} initialTemplate={template} />
    </div>
  );
}
