import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { deviceImageCandidates } from '../../../../shared/lib/deviceImage';
import type { CounterTriple } from '../../../../shared/types/monitor';
import { fmtInt } from '../../../../shared/lib/supplies';

/** Fila "etiqueta → valor" (handoff hifi, transversal): label Montserrat 700
 * 8.5px tracking, valor a la derecha, borde inferior sutil. */
export const Row = ({ label, value, mono = false, muted = false }: { label: string; value: ReactNode; mono?: boolean; muted?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line-200 py-[9px]">
    <span className="whitespace-nowrap font-montserrat text-[8.5px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{label}</span>
    <span className={`min-w-0 text-right text-[12.5px] leading-[1.3] ${muted ? 'text-ink-300' : 'text-ink-900'} ${mono ? 'font-mono' : 'font-sans'} overflow-hidden text-ellipsis`}>
      {value ?? '—'}
    </span>
  </div>
);

/** Cabecera interna de tarjeta (transversal #2): título Montserrat 700 9px
 * `letter-spacing:.15em`, borde inferior — sin degradado, sin ícono de color. */
export const CardTitle = ({ children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-line-150 px-5 py-3.5">
    <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{children}</span>
    {right}
  </div>
);

/** Tarjeta blanca, borde 1px, radio 5px, sin sombra (transversal #2/#3). */
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-[5px] border border-line-100 bg-white ${className}`}>{children}</div>
);

/** Foto del equipo con cadena de fallbacks (ver public/device-images/README.md). */
export const DeviceImage = ({ brand, model }: { brand: string | null; model: string | null }) => {
  const candidates = useMemo(() => deviceImageCandidates(brand, model), [brand, model]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [candidates]);
  const src = candidates[Math.min(idx, candidates.length - 1)];
  return (
    <img
      src={src}
      alt={model ?? 'Dispositivo'}
      className="max-h-full w-auto max-w-full object-contain"
      onError={() => setIdx(i => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
};

export const TripleRows = ({ label, t }: { label: string; t: CounterTriple | undefined }) => {
  if (!t) return null;
  return (
    <>
      <Row label={`${label} — monocromo`} value={fmtInt(t.mono)} />
      <Row label={`${label} — color`} value={fmtInt(t.color)} />
      <Row label={`${label} — total`} value={fmtInt(t.total)} />
    </>
  );
};
