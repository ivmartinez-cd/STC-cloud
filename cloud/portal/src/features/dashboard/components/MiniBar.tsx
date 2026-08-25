const TONE_BG = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
  brand: 'bg-brand',
} as const;

export type BarTone = keyof typeof TONE_BG;

/** Barra de progreso inline (estilo "Monitors Reporting 57 (98,3%) ▬▬▬" del SDS). */
export default function MiniBar({ pct, tone = 'emerald' }: { pct: number; tone?: BarTone }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <span className="inline-block w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden align-middle">
      <span className={`block h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${width}%` }} />
    </span>
  );
}

