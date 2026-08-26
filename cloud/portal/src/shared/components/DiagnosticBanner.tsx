import type { ReactNode } from 'react';

function BannerIcon() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[12px] font-bold text-white">!</span>
  );
}

interface CtaProps { label: string; onClick: () => void }

function BannerCta({ cta }: { cta: CtaProps | CtaProps[] }) {
  const ctas = Array.isArray(cta) ? cta : [cta];
  return (
    <div className="flex flex-wrap gap-2.5">
      {ctas.map((c) => (
        <button
          key={c.label} type="button" onClick={c.onClick}
          className="whitespace-nowrap rounded-[3px] border border-brand-warn-border bg-white px-[14px] py-[9px] font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-warn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  headline: string;
  body: ReactNode;
  cta?: CtaProps | CtaProps[];
}

/** Banner de diagnóstico genérico (handoff hifi #3, 26/08/2026) — extraído de
 * `features/monitors/components/remote-actions/DiagnosticBanner.tsx`, la 3ra
 * copia del mismo patrón (además de `PendingQueueDuplicatesBanner`,
 * `DeviceStatusBanners`). Es el componente estrella de esta entrega: lo usan
 * Alertas ("92% son equipos sin señal"), Correo (dos causas), Incidentes
 * (cierres automáticos en 0 min) y Configuración (bloqueantes). `cta` acepta
 * uno o varios botones — Correo pide dos ("VER CLIENTES SIN CONTACTO" +
 * "CONFIGURAR SMTP"). Borde `--color-brand-warn-border` (antes literal
 * `border-[#E0A76B]`, ahora token en `index.css`). */
export default function DiagnosticBanner({ headline, body, cta }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 rounded-[5px] border border-brand-chip-border bg-brand-soft p-4">
      <BannerIcon />
      <div className="min-w-[240px] flex-1">
        <div className="font-montserrat text-[8.5px] font-bold uppercase leading-[1.4] tracking-[.13em] text-brand-accent">{headline}</div>
        <div className="mt-1 font-sans text-[12.5px] leading-[1.4] text-brand-warn-text">{body}</div>
      </div>
      {cta && <BannerCta cta={cta} />}
    </div>
  );
}
