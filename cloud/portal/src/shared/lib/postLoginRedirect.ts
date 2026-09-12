const KEY = 'stc_post_login_redirect';

/**
 * R9 del gap analysis vs HP SDS: un 401 (sesión expirada) o un deep-link sin
 * sesión mandaban siempre a `/`, perdiendo la página en la que estaba el
 * usuario. Guarda la ruta actual para volver a ella después de un re-login.
 * Nunca guarda `/login` mismo (evitaría un loop de vuelta a sí mismo).
 *
 * @param path - Ruta a guardar. Tomarla de `window.location` sólo sirve
 *   cuando se llama de forma síncrona ANTES de navegar (caso `api.ts`, el
 *   401 imperativo); dentro de un efecto de React que corre junto a un
 *   `<Navigate>` hermano, el efecto del `<Navigate>` puede ejecutarse
 *   primero (React corre los efectos de hijos antes que los del padre) y
 *   dejar `window.location` ya apuntando a `/login` — por eso `RequireAuth`
 *   debe pasar la ruta capturada en el render (`useLocation()`), no leerla
 *   acá adentro.
 */
export function stashCurrentPath(path: string = window.location.pathname + window.location.search + window.location.hash): void {
  if (path.startsWith('/login')) return;
  sessionStorage.setItem(KEY, path);
}

/** Al cerrar sesión: que el próximo login (otro usuario, misma pestaña) no
 * aterrice en la última pantalla del anterior — un `client_viewer` rebotaba
 * en silencio contra `/agents` (auditoría 12/09/2026). */
export function clearPostLoginRedirect(): void {
  sessionStorage.removeItem(KEY);
}

/** Lee y borra la ruta guardada tras el login; `/` si no había ninguna. */
export function consumePostLoginRedirect(): string {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path || '/';
}
