import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { deviceImageCandidates } from '../../../../shared/lib/deviceImage';
import type { CounterTriple } from '../../../../shared/types/monitor';
import { fmtInt } from '../../../../shared/lib/supplies';

/** Fila "etiqueta → valor" de las tarjetas de datos (estilo SDS). */
export const Row = ({ label, value, mono = false, muted = false }: { label: string; value: ReactNode; mono?: boolean; muted?: boolean }) => (
  <div className="flex items-start justify-between gap-4 px-4 py-2 odd:bg-slate-50/70">
    <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">{label}</span>
    <span className={`text-[11px] text-right font-semibold ${muted ? 'text-slate-400' : 'text-slate-800'} ${mono ? 'font-mono' : ''} break-all`}>{value ?? '—'}</span>
  </div>
);

export const CardTitle = ({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div className="bg-gradient-to-r from-brand to-brand-hover px-4 py-2.5 text-white flex items-center justify-between">
    <div className="flex items-center gap-2">{icon}<h4 className="text-sm font-black tracking-wide">{children}</h4></div>
    {right}
  </div>
);

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`cd-panel bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs ${className}`}>{children}</div>
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
      className="max-h-44 w-auto object-contain drop-shadow-sm"
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
