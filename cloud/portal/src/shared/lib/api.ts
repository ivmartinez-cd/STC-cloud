import { stashCurrentPath } from './postLoginRedirect';

const BASE = '/api/v1';

/**
 * Error de API con el status HTTP adjunto — permite que un caller distinga un 403
 * ("tu rol no puede hacer esto", p.ej. un client_viewer contra una ruta de sólo
 * admin/operator) de cualquier otro error, sin depender de parsear `message`.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Lee el valor de una cookie no-httpOnly (ej. stc_csrf) desde document.cookie. */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/** Corte por defecto de una request del portal. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * `timeoutMs` sólo para las rutas que esperan a un tercero y por diseño tardan
 * más que una consulta a la base: hoy únicamente el proxy EWS remoto, que
 * espera hasta 15 s a que el agente vuelva por WSS con la página del equipo
 * (`EwsProxyUseCase`). Con los 15 s de acá el `AbortController` del navegador
 * ganaba la carrera contra el backend y el operador veía "La solicitud tardó
 * demasiado" en vez del error real (agente offline, timeout del agente…).
 */
export interface RequestOptions {
  timeoutMs?: number;
}

async function request<T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';

  // CSRF (double-submit cookie): reenviar el valor de stc_csrf como header en
  // cada mutación, para que el backend pueda validarlo contra la cookie.
  const method = (init.method || 'GET').toUpperCase();
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie('stc_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('La solicitud tardó demasiado. Verifica tu conexión.', { cause: err });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    stashCurrentPath();
    window.location.replace('/login');
    throw new Error('Sesión expirada');
  }

  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    console.warn('Error parsing JSON:', text, err);
  }

  if (!res.ok) {
    const errorMsg = (body as { error?: string })?.error || `HTTP ${res.status}`;
    // 403 no redirige (a diferencia de 401): la sesión sigue siendo válida, sólo el
    // rol no alcanza para esta ruta — un `client_viewer` navegando a algo fuera de
    // su allowlist debe ver el mensaje del backend, no perder la sesión.
    throw new ApiError(errorMsg, res.status);
  }

  return body as T;
}

export const api = {
  get:    <T>(path: string)                 => request<T>(path),
  post:   <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }, opts),
  put:    <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT',    body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                 => request<T>(path, { method: 'DELETE' }),
};
