import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { ActivityFiltersState, SegmentFilter } from './useActivityPage';

export interface ActivitySavedView {
  id: string;
  name: string;
  filters: { from: string; to: string; q: string; segment: SegmentFilter };
  created_at: string;
}

function currentFilters(f: ActivityFiltersState): ActivitySavedView['filters'] {
  return { from: f.from, to: f.to, q: f.q, segment: f.segment };
}

function useSavedViewsList() {
  const [views, setViews] = useState<ActivitySavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get<ActivitySavedView[]>('/activity/saved-views').then(setViews).catch(() => setViews([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { views, loading, load };
}

function applyView(f: ActivityFiltersState, v: ActivitySavedView): void {
  f.setFrom(v.filters.from); f.setTo(v.filters.to); f.setQ(v.filters.q); f.setSegment(v.filters.segment);
}

function useSaveView(f: ActivityFiltersState, load: () => void) {
  const { showToast } = useToast();
  return async () => {
    const name = window.prompt('Nombre para esta vista:')?.trim();
    if (!name) return;
    try {
      await api.post('/activity/saved-views', { name, filters: currentFilters(f) });
      showToast('Vista guardada', 'success');
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al guardar la vista', 'error'); }
  };
}

function useRemoveView(load: () => void) {
  const { showToast } = useToast();
  return async (v: ActivitySavedView) => {
    if (!window.confirm(`¿Eliminar la vista "${v.name}"?`)) return;
    try { await api.delete(`/activity/saved-views/${v.id}`); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error'); }
  };
}

function useSavedViewsActions(f: ActivityFiltersState, load: () => void) {
  const save = useSaveView(f, load);
  const remove = useRemoveView(load);
  const apply = (v: ActivitySavedView) => applyView(f, v);
  return { save, remove, apply };
}

/** "Guardar vista" (Movimientos, cierre de gap post-verificación del
 * handoff hifi #3, 26/08/2026) — presets personales de {from, to, q,
 * segment}; `client_id` queda afuera a propósito, es sólo deep-link. */
export function useSavedViews(f: ActivityFiltersState) {
  const { views, loading, load } = useSavedViewsList();
  const { save, remove, apply } = useSavedViewsActions(f, load);
  return { views, loading, save, remove, apply };
}
