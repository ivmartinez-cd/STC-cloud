import { Loader2, Search } from 'lucide-react';
import type { EwsPathPreset } from '../../lib/ewsPaths';

const CHIP = 'rounded-full border border-line-200 bg-white px-2.5 py-1 font-sans text-[11.5px] text-ink-700 transition-colors hover:border-brand hover:text-brand disabled:opacity-50';

/** Rutas que el motor de captura ya usa en cada barrido para esta marca: un atajo, no una lista cerrada. */
const PresetChips = ({ presets, onPick, disabled }: { presets: EwsPathPreset[]; onPick: (path: string) => void; disabled: boolean }) => (
  <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3.5">
    <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Rutas conocidas</span>
    {presets.map((p) => (
      <button key={p.path} type="button" disabled={disabled} onClick={() => onPick(p.path)} className={CHIP} title={p.path}>
        {p.label}
      </button>
    ))}
  </div>
);

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPick: (path: string) => void;
  loading: boolean;
  presets: EwsPathPreset[];
  ip: string;
}

/** Barra de consulta: sólo la RUTA — la IP la resuelve el backend desde `devices` y no es editable acá a propósito. */
export default function EwsPathBar({ value, onChange, onSubmit, onPick, loading, presets, ip }: Props) {
  return (
    <>
      <form className="flex items-center gap-2 px-5 pb-2.5 pt-3.5" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <span className="shrink-0 font-mono text-[12px] text-ink-300">http://{ip}</span>
        <input
          value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} spellCheck={false}
          placeholder="/DevMgmt/ProductConfigDyn.xml"
          className="min-w-0 flex-1 rounded-[3px] border border-line-300 bg-white px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand disabled:bg-surface-page"
        />
        <button type="submit" disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-[3px] bg-brand px-3.5 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Consultar
        </button>
      </form>
      <PresetChips presets={presets} onPick={onPick} disabled={loading} />
    </>
  );
}
