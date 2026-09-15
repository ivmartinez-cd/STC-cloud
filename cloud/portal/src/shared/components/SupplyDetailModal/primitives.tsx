import type { ReactNode } from 'react';

/**
 * Primitivas locales del modal. Deliberadamente NO se importan las de
 * `features/devices/components/detail/primitives.tsx`: `check-guards`
 * (regla `arch-portal`) prohíbe que `shared/` dependa de un feature, y este
 * modal lo abren dos features distintos (Consumibles y Dispositivo — detalle).
 */

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-[5px] border border-line-100 bg-white ${className}`}>{children}</div>
);

export const CardTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-line-150 px-5 py-3">
    <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{children}</span>
    {right}
  </div>
);

export const Row = ({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line-200 py-[7px] last:border-0">
    <span className="whitespace-nowrap font-montserrat text-[8.5px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{label}</span>
    <span className={`min-w-0 overflow-hidden text-ellipsis text-right text-[12.5px] leading-[1.3] text-ink-900 ${mono ? 'font-mono' : 'font-sans'}`}>
      {value ?? '—'}
    </span>
  </div>
);

/** Recuadro de una sola métrica grande (los "67 días restantes" del SDS). */
export const StatTile = ({ label, value, note, accent = false }: {
  label: string; value: ReactNode; note?: string; accent?: boolean;
}) => (
  <Card className="px-5 py-3.5">
    <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{label}</div>
    <div className={`mt-1 font-montserrat text-[26px] font-extrabold leading-none tracking-[-.02em] tabular-nums ${accent ? 'text-brand-accent' : 'text-ink-900'}`}>
      {value}
    </div>
    {note && <div className="mt-1.5 font-sans text-[11px] text-ink-300">{note}</div>}
  </Card>
);

export const LegendDot = ({ colorClass, label }: { colorClass: string; label: string }) => (
  <span className="flex items-center gap-2 font-sans text-[11px] text-ink-400">
    <span className={`block h-[3px] w-[10px] ${colorClass}`} />{label}
  </span>
);
