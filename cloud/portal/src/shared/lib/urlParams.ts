/**
 * Codecs de query params y merge sobre `URLSearchParams` — la parte PURA de
 * `shared/hooks/useUrlState.ts`, sin React ni router, para poder testearla
 * (`cloud/portal/tests/urlParams.test.ts`; el árbol de `src` no puede importar
 * `node:test`, ver el encabezado de `tests/parseRanges.test.ts`).
 *
 * Reglas que sostienen todo el estado de pantalla del portal:
 * - un valor desconocido en la URL cae al default en vez de romper la pantalla
 *   (un `?class=` inválido llegó a devolver 400 en prod, 12/09/2026);
 * - el default NO se escribe, para no ensuciar la URL ni generar historial;
 * - escribir es siempre un MERGE: cambiar de pestaña no puede borrar el filtro
 *   de otra (era el bug de `setSearchParams({ tab })`).
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

export type Codecs<S> = { [K in keyof S]: UrlCodec<S[K]> };

export function parseAll<S extends object>(codecs: Codecs<S>, params: URLSearchParams): S {
  const out = {} as S;
  for (const key of Object.keys(codecs) as Array<keyof S>) out[key] = codecs[key].parse(params.get(String(key)));
  return out;
}

/** Merge: sólo toca las claves de `changes`; el resto de la query sobrevive. */
export function applyChanges<S extends object>(codecs: Codecs<S>, prev: URLSearchParams, changes: Partial<S>): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const key of Object.keys(changes) as Array<keyof S>) {
    const formatted = codecs[key].format(changes[key] as S[typeof key]);
    if (formatted === null) next.delete(String(key)); else next.set(String(key), formatted);
  }
  return next;
}
