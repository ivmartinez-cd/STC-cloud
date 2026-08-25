import type { ReactNode } from 'react';

export interface ConfigStatus { label: string; active: boolean; }

/**
 * Patrón visual unificado de las 5 tarjetas de "Configuración de la cuenta"
 * (handoff hifi "Cliente — detalle", 25/08/2026): título + chip de estado,
 * cuerpo (párrafo/formulario propio de cada tarjeta) y pie fijo (metadato + CTA)
 * alineado al fondo con `margin-top:auto` para que las 5 tarjetas queden a la
 * misma altura. Sólo el CHROME es compartido — cada tarjeta sigue con su propia
 * lógica (ApiKeysCard/CustomFieldsCard/IncidentRulesCard/SupplyRequestSettingsCard/
 * NotificationEventsCard no se reescriben desde cero, ver README del handoff).
 */
export default function ConfigCardShell({
  title, status, meta, cta, children,
}: {
  title: string;
  status: ConfigStatus;
  meta: string;
  cta: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="truncate font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{title}</span>
        <span
          className={`inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${
            status.active ? 'bg-surface-avatar text-ink-650' : 'bg-brand-soft text-brand-accent'
          }`}
        >
          <span className={`block h-1.5 w-1.5 rounded-full ${status.active ? 'bg-brand-gray' : 'bg-brand'}`} />
          {status.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-[18px] pt-4">
        <div className="flex-1">{children}</div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-surface-track pt-[13px]">
          <span className="truncate font-sans text-[11.5px] text-ink-300">{meta}</span>
          <button
            type="button" onClick={cta.onClick}
            className="shrink-0 whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline"
          >
            {cta.label} →
          </button>
        </div>
      </div>
    </div>
  );
}
