import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import SearchInput from '../../../shared/components/SearchInput';
import SegmentChips from '../../../shared/components/SegmentChips';
import type { ActivityFiltersState, SegmentFilter } from '../hooks/useActivityPage';
import { useSavedViews, type ActivitySavedView } from '../hooks/useSavedViews';

const SEGMENT_OPTIONS: Array<{ value: SegmentFilter; label: string }> = [
  { value: 'all', label: 'TODO' },
  { value: 'config', label: 'CONFIGURACIÓN' },
  { value: 'down', label: 'BAJAS' },
  { value: 'others', label: 'OTROS OPERADORES' },
];

interface Props { filters: ActivityFiltersState }

function SavedViewsPicker({ views, selectedId, onPick }: { views: ActivitySavedView[]; selectedId: string; onPick: (id: string) => void }) {
  return (
    <select value={selectedId} onChange={(e) => onPick(e.target.value)} className="rounded-[3px] border border-line-100 bg-white px-2 py-[9px] font-sans text-[11.5px] text-ink-700 outline-none">
      <option value="">Mis vistas…</option>
      {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
}

function useSavedViewSelection(views: ActivitySavedView[], apply: (v: ActivitySavedView) => void) {
  const [selectedId, setSelectedId] = useState('');
  const onPick = (id: string) => {
    setSelectedId(id);
    const v = views.find((x) => x.id === id);
    if (v) apply(v);
  };
  const selected = views.find((x) => x.id === selectedId) ?? null;
  return { selectedId, onPick, selected, clear: () => setSelectedId('') };
}

function SavedViewsButtons({ selected, onRemove, onSave }: { selected: ActivitySavedView | null; onRemove: () => void; onSave: () => void }) {
  return (
    <>
      {selected && (
        <button type="button" title="Eliminar esta vista" onClick={onRemove} className="rounded-[3px] p-2 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent">
          <Trash2 size={13} />
        </button>
      )}
      <button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-[3px] border border-line-100 bg-white px-3 py-[9px] font-montserrat text-[10px] font-bold uppercase tracking-[.1em] text-ink-700 hover:border-brand-accent hover:text-brand-accent">
        <Bookmark size={13} /> GUARDAR VISTA
      </button>
    </>
  );
}

/** "Guardar vista" (Movimientos, cierre de gap post-verificación del handoff
 * hifi #3, 26/08/2026) — antes era un botón sin acción en el mockup. Elegir
 * una vista del `<select>` aplica sus filtros de inmediato; el tacho borra
 * la seleccionada (no "la última", evita ambigüedad sobre cuál se pierde). */
function SavedViewsControl({ f }: { f: ActivityFiltersState }) {
  const { views, save, remove, apply } = useSavedViews(f);
  const sel = useSavedViewSelection(views, apply);
  const onRemove = () => { if (sel.selected) { void remove(sel.selected); sel.clear(); } };

  return (
    <div className="flex items-center gap-1.5">
      {views.length > 0 && <SavedViewsPicker views={views} selectedId={sel.selectedId} onPick={sel.onPick} />}
      <SavedViewsButtons selected={sel.selected} onRemove={onRemove} onSave={() => void save()} />
    </div>
  );
}

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
      <div className="ml-auto flex items-center gap-3.5">
        <SavedViewsControl f={f} />
        <span className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Agrupado por día</span>
      </div>
    </div>
  );
}
