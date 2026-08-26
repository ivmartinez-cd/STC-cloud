import SearchInput from '../../../shared/components/SearchInput';
import SegmentChips from '../../../shared/components/SegmentChips';
import type { ActivityFiltersState, SegmentFilter } from '../hooks/useActivityPage';

const SEGMENT_OPTIONS: Array<{ value: SegmentFilter; label: string }> = [
  { value: 'all', label: 'TODO' },
  { value: 'config', label: 'CONFIGURACIÓN' },
  { value: 'down', label: 'BAJAS' },
  { value: 'others', label: 'OTROS OPERADORES' },
];

interface Props { filters: ActivityFiltersState }

/** Barra de filtros de Movimientos (handoff hifi #3, fase 5) — DESDE/HASTA +
 * buscador + segmento único (un evento cae en TODO, CONFIGURACIÓN, BAJAS u
 * OTROS OPERADORES, nunca en dos a la vez — por eso `SegmentChips`, no
 * toggles independientes como en Alertas). */
export default function ActivityFilterBar({ filters: f }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <label className="flex items-center gap-2 rounded-[3px] border border-line-100 bg-white px-3 py-[9px]">
        <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">DESDE</span>
        <input type="date" value={f.from} onChange={(e) => f.setFrom(e.target.value)} className="font-mono text-[12px] text-ink-900 outline-none" />
      </label>
      <label className="flex items-center gap-2 rounded-[3px] border border-line-100 bg-white px-3 py-[9px]">
        <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">HASTA</span>
        <input type="date" value={f.to} onChange={(e) => f.setTo(e.target.value)} className="font-mono text-[12px] text-ink-900 outline-none" />
      </label>
      <SearchInput value={f.q} onChange={f.setQ} placeholder="Buscar por objetivo, usuario o IP…" className="min-w-[230px] max-w-[340px]" />
      <SegmentChips options={SEGMENT_OPTIONS} active={f.segment} onChange={f.setSegment} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Agrupado por día</div>
    </div>
  );
}
