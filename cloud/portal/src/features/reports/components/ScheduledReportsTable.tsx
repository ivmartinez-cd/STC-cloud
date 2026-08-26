import { Download, Loader2, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import EstadoChip from '../../../shared/components/EstadoChip';
import { FREQ_LABELS, REPORT_TYPE_LABELS, type ScheduledReport } from '../types/scheduledReports';
import { fmtClosedAt } from '../lib/reportsPresentation';
import { BTN_PRIMARY_LG } from '../../../shared/lib/buttons';

const GRID_COLS = 'grid-cols-[minmax(240px,1fr)_170px_150px_160px_150px_146px]';
const HEAD_LABELS = ['NOMBRE', 'ALCANCE', 'FRECUENCIA', 'DESTINATARIOS', 'PRÓXIMO ENVÍO', 'ESTADO'];

function statusChip(r: ScheduledReport): { label: string; variant: 'neutral' | 'attention' } {
  if (!r.enabled) return { label: 'PAUSADO', variant: 'neutral' };
  if (r.last_run_status === 'error') return { label: 'ERROR', variant: 'attention' };
  return { label: 'ACTIVO', variant: 'neutral' };
}

function RowActions({ r, busy, onRun, onTogglePause, onEdit, onRemove }: {
  r: ScheduledReport; busy: boolean;
  onRun: () => void; onTogglePause: () => void; onEdit: () => void; onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <a href={`/api/v1/scheduled-reports/${r.id}/download`} target="_blank" rel="noreferrer" title="Descargar ahora" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><Download size={14} /></a>
      <button type="button" onClick={onRun} disabled={busy} title="Ejecutar y enviar ahora" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      </button>
      <button type="button" onClick={onTogglePause} title={r.enabled ? 'Pausar' : 'Reanudar'} className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent">
        {r.enabled ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button type="button" onClick={onEdit} title="Editar" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><Pencil size={14} /></button>
      <button type="button" onClick={onRemove} title="Eliminar" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><Trash2 size={14} /></button>
    </div>
  );
}

function NameCell({ r }: { r: ScheduledReport }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{r.name}</div>
      <div className="truncate font-sans text-[11px] text-ink-300">{REPORT_TYPE_LABELS[r.report_type]}</div>
    </div>
  );
}

function Row({ r, clientName, busy, onRun, onTogglePause, onEdit, onRemove }: {
  r: ScheduledReport; clientName: (id: string | null) => string; busy: boolean;
  onRun: () => void; onTogglePause: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const chip = statusChip(r);
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ minHeight: 54 }}>
      <NameCell r={r} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{clientName(r.client_id)}</span>
      <span className="font-sans text-[12.5px] text-ink-700">{FREQ_LABELS[r.schedule_freq]}</span>
      <span className="truncate font-sans text-[12.5px] text-ink-700" title={r.recipients.join(', ')}>{r.recipients.length || '—'}</span>
      <span className="font-sans text-[12px] text-ink-500">{fmtClosedAt(r.next_run_at ?? '') || '—'}</span>
      <div className="flex items-center justify-between gap-2">
        <EstadoChip label={chip.label} variant={chip.variant} />
        <RowActions r={r} busy={busy} onRun={onRun} onTogglePause={onTogglePause} onEdit={onEdit} onRemove={onRemove} />
      </div>
    </div>
  );
}

interface Props {
  items: ScheduledReport[];
  loading: boolean;
  clientName: (id: string | null) => string;
  busyId: string | null;
  onRun: (r: ScheduledReport) => void;
  onTogglePause: (r: ScheduledReport) => void;
  onEdit: (r: ScheduledReport) => void;
  onRemove: (r: ScheduledReport) => void;
  onCreate: () => void;
}

function EmptyBody({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 py-11 text-center">
      <div className="font-sans text-[14px] font-semibold text-ink-600">Todavía no hay informes guardados</div>
      <div className="mx-auto mt-2 max-w-[52ch] font-sans text-[12.5px] leading-[1.6] text-ink-300">
        Cuando creés el primero aparecerá acá con su próxima fecha de envío, y vas a poder pausarlo o descargar las ediciones anteriores.
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <button type="button" onClick={onCreate} className={BTN_PRIMARY_LG}>+ NUEVO INFORME</button>
      </div>
    </div>
  );
}

/** "Tus informes" (handoff hifi #3, fase 5) — encabezado real + empty state
 * DENTRO de la tabla (no una tarjeta aparte), tal como pide el mockup. */
export default function ScheduledReportsTable({ items, loading, clientName, busyId, onRun, onTogglePause, onEdit, onRemove, onCreate }: Props) {
  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-avatar px-5 py-3`}>
        {HEAD_LABELS.map((h) => <span key={h} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{h}</span>)}
      </div>
      {loading ? (
        <div className="h-24 animate-pulse bg-surface-track" />
      ) : items.length === 0 ? (
        <EmptyBody onCreate={onCreate} />
      ) : (
        items.map((r) => (
          <Row key={r.id} r={r} clientName={clientName} busy={busyId === r.id}
            onRun={() => onRun(r)} onTogglePause={() => onTogglePause(r)} onEdit={() => onEdit(r)} onRemove={() => onRemove(r)} />
        ))
      )}
    </div>
  );
}
