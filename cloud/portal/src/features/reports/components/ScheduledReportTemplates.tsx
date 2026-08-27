import { FREQ_LABELS, type ReportTemplate } from '../types/scheduledReports';

/** Colapsada, la grilla muestra una sola fila de 4 (a xl): la tabla de abajo
 * es el contenido principal y las plantillas no pueden comerle el alto. */
export const TEMPLATES_COLLAPSED = 4;

function FreqChip({ t }: { t: ReportTemplate }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
      <span className="block h-1.5 w-1.5 rounded-full bg-brand" />{FREQ_LABELS[t.suggested_frequency]}
    </span>
  );
}

/** Tarjeta compacta (27/08/2026): una línea de descripción (completa en el
 * `title`) en vez del párrafo + tags — la versión alta, con 7 plantillas en
 * 3 columnas, ocupaba 700px y empujaba "Tus informes" fuera del viewport. */
function TemplateCard({ t, onUse }: { t: ReportTemplate; onUse: (t: ReportTemplate) => void }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[5px] border border-line-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{t.label}</span>
        <FreqChip t={t} />
      </div>
      <p className="mt-1.5 truncate font-sans text-[12px] leading-[1.5] text-ink-500" title={t.description}>{t.description}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-ink-300">{t.default_format.toUpperCase()} · Plantilla real</span>
        <button type="button" onClick={() => onUse(t)} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">USAR PLANTILLA →</button>
      </div>
    </div>
  );
}

/** "+N MÁS" / "VER MENOS" — sólo si hay más plantillas que la fila colapsada. */
export function TemplatesToggle({ total, showAll, onToggle }: { total: number; showAll: boolean; onToggle: () => void }) {
  if (total <= TEMPLATES_COLLAPSED) return null;
  return (
    <button type="button" onClick={onToggle} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">
      {showAll ? 'VER MENOS' : `+${total - TEMPLATES_COLLAPSED} MÁS`}
    </button>
  );
}

interface Props { templates: ReportTemplate[]; showAll: boolean; onUse: (t: ReportTemplate) => void }

/** Plantillas (handoff hifi #3, fase 5) — los 7 `REPORT_TYPES` reales de
 * `GET /scheduled-reports/templates`. Colapsada muestra las primeras
 * `TEMPLATES_COLLAPSED`; `showAll` las despliega todas (la tabla de abajo se
 * achica sola, es flex). */
export default function ScheduledReportTemplates({ templates, showAll, onUse }: Props) {
  const visible = showAll ? templates : templates.slice(0, TEMPLATES_COLLAPSED);
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {visible.map((t) => <TemplateCard key={t.report_type} t={t} onUse={onUse} />)}
    </div>
  );
}
