import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './useDebounce';
import { applyChanges, parseAll, type Codecs } from '../lib/urlParams';

/**
 * Estado de pantalla (tab, filtro, orden, página) con la URL como ÚNICA fuente de
 * verdad. Nació de la auditoría del 12/09/2026: cada listado copiaba la URL al
 * `useState` una sola vez al montar y después sólo escribía estado → URL, así que
 * al cambiar la URL desde afuera (ítem del sidebar sobre la sección activa,
 * atrás/adelante, buscador global entre dos detalles) la pantalla seguía mostrando
 * el estado viejo con la URL nueva. Acá el estado se deriva de `useSearchParams()`
 * en cada render, y escribir es siempre un merge funcional con `replace` (cambiar
 * de chip o de página no apila entradas de historial; `push: true` para lo que sí
 * debe apilar).
 *
 * Los codecs y el merge viven en `shared/lib/urlParams.ts` (puros, con tests).
 */
export {
  enumParam, stringParam, flagParam, pageParam, type UrlCodec, type Codecs,
} from '../lib/urlParams';

export type UrlPatch<S> = (changes: Partial<S>, opts?: { push?: boolean }) => void;

/** `codecs` tiene que ser estable (constante de módulo o `useMemo`). */
export function useUrlState<S extends object>(codecs: Codecs<S>): [S, UrlPatch<S>] {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseAll(codecs, searchParams), [codecs, searchParams]);
  const patch = useCallback<UrlPatch<S>>((changes, opts) => {
    // Base: la URL viva, no los params del render. `setSearchParams(prev => …)`
    // recibe los params del ÚLTIMO render, así que dos `patch` en el mismo tick
    // (limpiar varios chips, o una escritura durante la transición de `?tab=`)
    // se pisaban entre sí. `BrowserRouter` aplica cada `replace` sincrónicamente
    // sobre `window.history`, por eso la URL viva sí acumula.
    const live = new URLSearchParams(window.location.search);
    setSearchParams(applyChanges(codecs, live, changes), { replace: !opts?.push });
  }, [codecs, setSearchParams]);
  return [state, patch];
}

/**
 * Buscador con debounce sobre `?q=`: el input necesita estado local para tipear
 * (no se escribe la URL tecla a tecla), pero la URL manda: si cambia desde afuera
 * se pisa lo tipeado. `commit` escribe el valor efectivo (≥ `minLength` chars,
 * trim) a la URL — y le toca resetear la página, igual que un chip. Con `active`
 * en false (tab que no está visible) no se escribe nada.
 */
export function useUrlSearchQuery(urlQuery: string, commit: (q: string) => void, active = true, minLength = 2) {
  const [rawQuery, setRawQuery] = useState(urlQuery);
  const trimmed = useDebounce(rawQuery, 300).trim();
  const effectiveQuery = trimmed.length >= minLength ? trimmed : '';
  const commitRef = useRef(commit);
  commitRef.current = commit;
  // URL → estado (sidebar, atrás/adelante, link entrante). Si coincide con lo
  // efectivo es nuestro propio commit volviendo: no tocar lo tipeado.
  useEffect(() => { if (urlQuery !== effectiveQuery) setRawQuery(urlQuery); }, [urlQuery]); // eslint-disable-line react-hooks/exhaustive-deps
  // estado → URL. Comparar antes de escribir evita resetear la página cuando la
  // URL ya trae el mismo `q` (F5, atrás con `?q=…&page=3`).
  useEffect(() => { if (active && effectiveQuery !== urlQuery) commitRef.current(effectiveQuery); }, [effectiveQuery, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rawQuery, setRawQuery, effectiveQuery };
}
