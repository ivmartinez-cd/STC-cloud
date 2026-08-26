import type { ReportTemplate } from '../types/scheduledReports';

function TemplateCardHeader({ t }: { t: ReportTemplate }) {
  const freq = t.suggested_frequency !== 'none' ? t.suggested_frequency.toUpperCase() : 'MANUAL';
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{t.label}</span>
      <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
        <span className="block h-1.5 w-1.5 rounded-full bg-brand" />{freq}
      </span>
    </div>
  );
}

function TemplateCard({ t, onUse }: { t: ReportTemplate; onUse: (t: ReportTemplate) => void }) {
  const tags = [t.default_format.toUpperCase(), t.suggested_frequency !== 'none' ? t.suggested_frequency.toUpperCase() : 'MANUAL'];
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <TemplateCardHeader t={t} />
      <div className="flex flex-1 flex-col px-5 pb-[18px] pt-4">
        <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-500">{t.description}</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((g) => <span key={g} className="rounded-[2px] border border-line-200 px-[9px] py-[5px] font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-ink-300">{g}</span>)}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-150 pt-[13px]">
          <span className="font-sans text-[11.5px] text-ink-300">Plantilla real</span>
          <button type="button" onClick={() => onUse(t)} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">USAR PLANTILLA →</button>
        </div>
      </div>
    </div>
  );
}

/** Plantillas (handoff hifi #3, fase 5) — los 5 `REPORT_TYPES` reales de
 * `GET /scheduled-reports/templates`, no los 6 nombres del mockup (2 de
 * ellos, "CIERRE DE FACTURACIÓN" y "AUDITORÍA DE ACCESOS", son de otros
 * módulos — reports/cierres y audit-logs — sin `ReportType` detrás). */
export default function ScheduledReportTemplates({ templates, onUse }: { templates: ReportTemplate[]; onUse: (t: ReportTemplate) => void }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((t) => <TemplateCard key={t.report_type} t={t} onUse={onUse} />)}
    </div>
  );
}
