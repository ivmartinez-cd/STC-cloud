import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Encabezado de pantalla genérico (handoff hifi #3, 26/08/2026): rayita +
 * eyebrow, título 34px, bajada, acciones a la derecha. Extraído del patrón
 * repetido inline en cada página hifi (`features/devices/components/
 * DeviceInventoryHeader.tsx`, `Clients.tsx`, `PendingQueueHeader.tsx`) —
 * acá sólo el molde; las acciones concretas (botones, export) las arma el
 * caller y se pasan como `actions`. */
export default function PageHeader({ eyebrow, title, subtitle, actions }: Props) {
  return (
    <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2.5 flex items-center gap-3">
          <span className="block h-0.5 w-5 bg-brand" />
          <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">{eyebrow}</span>
        </div>
        <h1 className="m-0 font-montserrat text-[34px] font-extrabold leading-[1.05] tracking-[-.018em] text-ink-900">{title}</h1>
        {subtitle && <p className="mt-2.5 font-sans text-[12.5px] text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}
