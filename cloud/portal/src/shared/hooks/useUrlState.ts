import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './useDebounce';

/**
 * Estado de pantalla (tab, filtro, orden, página) con la URL como ÚNICA fuente de
 * verdad. Nació de la auditoría del 12/09/2026: cada listado copiaba la URL al
 * `useState` una sola vez al montar y después sólo escribía estado → URL, así que
 * al cambiar la URL desde afuera (ítem del sidebar sobre la sección activa,
 * atrás/adelante, buscador global entre dos detalles) la pantalla seguía mostrando
 * el estado viejo con la URL nueva. Acá el estado se deriva de `useSearchParams()`
 * en cada render, y escribir es siempre un merge funcional con `replace` (cambiar
 * de chip o de página no apila entradas de historial; `push: true` para lo que sí
 * debe apilar). Los defaults se omiten de la URL para no ensuciarla.
 */
export type UrlCodec<T> = {
  parse: (raw: string | null) => T;
  /** `null` borra el param (valor por defecto). */
  format: (value: T) => string | null;
};

export function enumParam<T extends string>(values: readonly T[], fallback: T): UrlCodec<T> {
  return {
    parse: (raw) => (raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : fallback),
    format: (value) => (value === fallback ? null : value),
  };
}

export function stringParam(): UrlCodec<string> {
  return { parse: (raw) => raw ?? '', format: (value) => (value ? value : null) };
}

export function flagParam(): UrlCodec<boolean> {
  return { parse: (raw) => raw === '1', format: (value) => (value ? '1' : null) };
}

/** `?page=` es 1-based (como se muestra); el estado es 0-based. Basura → página 0. */
export const pageParam: UrlCodec<number> = {
  parse: (raw) => { const n = Number(raw); return Number.isInteger(n) && n > 1 ? n - 1 : 0; },
  format: (page) => (page > 0 ? String(page + 1) : null),
};

type Codecs<S> = { [K in keyof S]: UrlCodec<S[K]> };
export type UrlPatch<S> = (changes: Partial<S>, opts?: { push?: boolean }) => void;

function parseAll<S extends object>(codecs: Codecs<S>, params: URLSearchParams): S {
  const out = {} as S;
  for (const key of Object.keys(codecs) as Array<keyof S>) out[key] = codecs[key].parse(params.get(String(key)));
  return out;
}

function applyChanges<S extends object>(codecs: Codecs<S>, prev: URLSearchParams, changes: Partial<S>): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const key of Object.keys(changes) as Array<keyof S>) {
    const formatted = codecs[key].format(changes[key] as S[typeof key]);
    if (formatted === null) next.delete(String(key)); else next.set(String(key), formatted);
  }
  return next;
}

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
