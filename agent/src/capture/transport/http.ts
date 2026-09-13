import http  from 'http';
import https from 'https';
import zlib  from 'zlib';

/** Timeout por petición EWS. Firmwares viejos (SyncThru V4, JetDirect) pueden tardar >5 s en responder. */
export const EWS_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) STC-Cloud-Agent/1.0';

/**
 * GET HTTP/S de bajo nivel contra el Embedded Web Server de una impresora.
 * - Sigue 301/302/307/308 (máx. 3 saltos; cambia de protocolo si el `Location` lo indica).
 * - Acepta certificados autofirmados (`rejectUnauthorized: false`).
 * - Descomprime gzip/deflate.
 * - Nunca rechaza: devuelve `null` ante error, timeout o status fuera de 2xx.
 */
export function fetchHttp(
  ip: string,
  path: string,
  protocol: 'http' | 'https' = 'http',
  redirectDepth = 0,
  timeoutMs = EWS_TIMEOUT_MS,
): Promise<string | null> {
  if (redirectDepth > MAX_REDIRECTS) return Promise.resolve(null);

  return new Promise((resolve) => {
    const lib  = protocol === 'https' ? https : http;
    const port = protocol === 'https' ? 443   : 80;
    const req  = lib.request(
      {
        hostname: ip,
        port,
        path,
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
        headers: {
          'Accept-Encoding': 'gzip, deflate, identity',
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 307, 308].includes(status) && res.headers.location) {
          const next = resolveRedirect(res.headers.location, path, protocol);
          res.resume();
          resolve(fetchHttp(ip, next.path, next.protocol, redirectDepth + 1, timeoutMs));
          return;
        }
        if (status < 200 || status >= 300) { res.resume(); resolve(null); return; }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const buffer   = Buffer.concat(chunks);
            const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
            if (encoding.includes('gzip'))         resolve(zlib.gunzipSync(buffer).toString('utf8'));
            else if (encoding.includes('deflate')) resolve(zlib.inflateSync(buffer).toString('utf8'));
            else                                   resolve(buffer.toString('utf8'));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function resolveRedirect(location: string, currentPath: string, currentProtocol: 'http' | 'https'): { path: string; protocol: 'http' | 'https' } {
  if (location.startsWith('https://') || location.startsWith('http://')) {
    const protocol: 'http' | 'https' = location.startsWith('https://') ? 'https' : 'http';
    const rest  = location.slice(protocol.length + 3);
    const slash = rest.indexOf('/');
    return { protocol, path: slash !== -1 ? rest.slice(slash) : '/' };
  }
  if (location.startsWith('/')) return { protocol: currentProtocol, path: location };
  // Relativo al directorio actual
  const base = currentPath.slice(0, currentPath.lastIndexOf('/') + 1) || '/';
  return { protocol: currentProtocol, path: base + location };
}

/** Utilidades de parseo compartidas por las familias. */
export function xmlVal(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>\\s*([^<]+?)\\s*<\\/(?:[\\w-]+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

export function toInt(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const n = parseInt(v.replace(/[,\.\s]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function clampPct(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, Math.round(v)));
}

// ─── Petición HTTP de bajo nivel (método/headers/cuerpo/cookies) ─────────────

export interface HttpResponse {
  status:  number;
  headers: Record<string, string | string[] | undefined>;
  body:    string;
}

export interface HttpRequestOptions {
  path:             string;
  protocol?:        'http' | 'https';
  method?:          'GET' | 'POST';
  headers?:         Record<string, string>;
  body?:            string;
  timeoutMs?:       number;
}

/**
 * Petición HTTP/S sin seguir redirecciones (devuelve el 3xx tal cual, con `Location` y `Set-Cookie`).
 * Para flujos con sesión (sign-in de EWS). `null` sólo ante error de red/timeout.
 */
export function httpRequest(ip: string, opts: HttpRequestOptions): Promise<HttpResponse | null> {
  const protocol = opts.protocol ?? 'http';
  const lib  = protocol === 'https' ? https : http;
  const port = protocol === 'https' ? 443 : 80;
  return new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: ip, port, path: opts.path, method: opts.method ?? 'GET',
        timeout: opts.timeoutMs ?? EWS_TIMEOUT_MS, rejectUnauthorized: false,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Encoding': 'gzip, deflate, identity',
          ...(opts.body !== undefined ? { 'Content-Length': String(Buffer.byteLength(opts.body)) } : {}),
          ...(opts.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
            const body = enc.includes('gzip') ? zlib.gunzipSync(buffer).toString('utf8')
              : enc.includes('deflate') ? zlib.inflateSync(buffer).toString('utf8') : buffer.toString('utf8');
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
          } catch { resolve(null); }
        });
      },
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export interface EwsProxyResponse {
  status: number;
  headers: Record<string, string>;
  /** `Set-Cookie` crudos del equipo, aparte del resto: los guarda el gateway, no el navegador. */
  setCookie?: string[];
  bodyBase64: string;
  truncated: boolean;
}

/**
 * Proxy de un GET a la EWS para el túnel remoto (Fase 2, `CommandHandler.ts`
 * caso `EWS_PROXY`) — a diferencia de `httpRequest`/`fetchHttp`:
 * - Corta la descarga apenas se supera `maxBytes` (destruye la conexión),
 *   en vez de acumular todo en memoria antes de chequear tamaño (así era
 *   `httpRequest` — un EWS grande/malicioso podía inflar memoria sin límite).
 * - Devuelve el body en base64, nunca `toString('utf8')` — una página EWS
 *   con imágenes embebidas (gráficos de estado) se corrompería con utf8.
 * - Nunca sigue redirects (mismo criterio que `httpRequest`, no
 *   `fetchHttp` — evita el bug ya conocido de reusar la IP original en un
 *   `Location` absoluto).
 */
/** `port` es parametrizable sólo para poder testear con un servidor TCP local — en producción siempre es 80, ningún caller real lo pasa. */
export function proxyEwsRequest(
  ip: string,
  path: string,
  maxBytes: number,
  timeoutMs = EWS_TIMEOUT_MS,
  port = 80
): Promise<EwsProxyResponse | null> {
  return ewsRequest(ip, path, maxBytes, { port }, timeoutMs).then((r) => (r.ok ? r.response : null));
}

/** Métodos que el gateway puede relayar. `CONNECT`/`TRACE` y cualquier verbo raro quedan afuera. */
const RELAYABLE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Headers que NUNCA se copian tal cual entre el navegador y la impresora
 * (ni de ida ni de vuelta): son de la conexión, no del mensaje, y relayarlos
 * rompe el framing. `content-length` se recalcula solo a partir del body, y
 * `content-encoding`/`accept-encoding` se manejan acá adentro porque esta
 * función ya descomprime la respuesta antes de devolverla.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding', 'accept-encoding',
]);

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const name = key.toLowerCase();
    // Sin saltos de línea: un valor con CRLF inyectaría headers extra en el request a la impresora.
    if (HOP_BY_HOP_HEADERS.has(name) || /[\r\n]/.test(String(value))) continue;
    out[name] = String(value);
  }
  return out;
}

export interface EwsRelayOptions {
  method?: string;
  /** Headers que el gateway decidió relayar (cookie, authorization, content-type, accept…). */
  headers?: Record<string, string>;
  bodyBase64?: string;
  protocol?: 'http' | 'https';
  port?: number;
}

/**
 * Resultado explícito en vez de `null`: el gateway necesita distinguir
 * "no hay nada escuchando en el 80" (⇒ reintentar por HTTPS) de un timeout o
 * de un error de TLS, y el operador necesita ver cuál de los tres fue.
 */
export type EwsRelayResult =
  | { ok: true; response: EwsProxyResponse }
  | { ok: false; error: string; code: string };

/**
 * Relay de UNA petición HTTP contra la EWS de un equipo de la LAN, para el
 * gateway de EWS remoto del portal. Generaliza `proxyEwsRequest` (que era
 * GET-only sobre HTTP:80, para el visor de una sola página):
 * - Relaya método, headers y body — es lo que permite loguearse en el equipo
 *   y mandar formularios, no sólo leer.
 * - Habla HTTP y HTTPS, aceptando el certificado autofirmado que trae de
 *   fábrica cualquier impresora (`rejectUnauthorized: false`): el canal que
 *   importa es el WSS autenticado agente↔nube, no el del último salto dentro
 *   de la LAN del cliente.
 * - NO sigue redirects: el `Location` se le devuelve al navegador, que ya sabe
 *   seguirlo por su cuenta (y así la barra de direcciones queda consistente).
 *
 * Lo que NO cambia respecto del original, porque es lo que sostiene la
 * seguridad de todo esto: el tope de tamaño cortado en streaming, y que el
 * caller (`CommandHandler`) valide la IP contra `known_devices` antes de
 * llamar acá.
 */
export function ewsRequest(
  ip: string,
  path: string,
  maxBytes: number,
  opts: EwsRelayOptions = {},
  timeoutMs = EWS_TIMEOUT_MS
): Promise<EwsRelayResult> {
  const method = (opts.method ?? 'GET').toUpperCase();
  if (!RELAYABLE_METHODS.has(method)) {
    return Promise.resolve({ ok: false, error: `Método no relayable: ${method}`, code: 'METHOD' });
  }
  const protocol = opts.protocol ?? 'http';
  const body = opts.bodyBase64 ? Buffer.from(opts.bodyBase64, 'base64') : null;
  const headers: Record<string, string | number> = {
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'gzip, deflate, identity',
    ...sanitizeHeaders(opts.headers),
  };
  if (body) headers['Content-Length'] = body.length;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: EwsRelayResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const lib = protocol === 'https' ? https : http;
    const port = opts.port ?? (protocol === 'https' ? 443 : 80);
    const req = lib.request(
      { hostname: ip, port, path, method, timeout: timeoutMs, rejectUnauthorized: false, headers },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;

        res.on('data', (c: Buffer) => {
          if (truncated) return;
          total += c.length;
          if (total > maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          try {
            finish({ ok: true, response: decodeEwsResponse(res, Buffer.concat(chunks), truncated) });
          } catch {
            finish({ ok: false, error: 'No se pudo descomprimir la respuesta del equipo', code: 'DECODE' });
          }
        });
        // `destroy()` por el corte de tamaño dispara 'close', no 'end' — sin
        // este handler, la promesa nunca se resolvería en ese caso.
        res.on('close', () => {
          if (!settled && truncated) {
            const response = { status: res.statusCode ?? 0, headers: {}, bodyBase64: Buffer.concat(chunks).toString('base64'), truncated: true };
            finish({ ok: true, response });
          }
        });
      },
    );
    req.on('error', (e: NodeJS.ErrnoException) => {
      finish({ ok: false, error: `${e.code ?? 'ERROR'} hablando con ${ip}:${port}`, code: e.code ?? 'ERROR' });
    });
    req.on('timeout', () => {
      req.destroy();
      finish({ ok: false, error: `El equipo no respondió en ${timeoutMs} ms`, code: 'TIMEOUT' });
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Normaliza la respuesta del equipo: descomprime y borra los headers que
 * dejaron de ser ciertos al hacerlo (`content-encoding`, `content-length`) más
 * los de conexión. Sin esto el navegador intenta descomprimir por segunda vez
 * un cuerpo que ya viene en claro y la página no carga.
 *
 * `set-cookie` se preserva como lista aparte — es lo único que el gateway
 * guarda en su propio jar del lado del servidor (el navegador nunca ve las
 * cookies de la impresora).
 */
function decodeEwsResponse(res: http.IncomingMessage, buffer: Buffer, truncated: boolean): EwsProxyResponse {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  const decoded = enc.includes('gzip') ? zlib.gunzipSync(buffer)
    : enc.includes('deflate') ? zlib.inflateSync(buffer) : buffer;
  const headers: Record<string, string> = {};
  const setCookie: string[] = [];
  for (const [key, value] of Object.entries(res.headers)) {
    const name = key.toLowerCase();
    if (name === 'set-cookie') { setCookie.push(...(Array.isArray(value) ? value : [String(value)])); continue; }
    if (HOP_BY_HOP_HEADERS.has(name)) continue;
    if (typeof value === 'string') headers[name] = value;
    else if (Array.isArray(value)) headers[name] = value.join(', ');
  }
  return { status: res.statusCode ?? 0, headers, setCookie, bodyBase64: decoded.toString('base64'), truncated };
}

/** Extrae pares `nombre=valor` de `Set-Cookie` y los fusiona sobre una cookie previa. */
export function mergeCookies(previous: string, res: HttpResponse | null): string {
  const jar = new Map<string, string>();
  for (const kv of previous.split(';')) { const [k, ...v] = kv.trim().split('='); if (k) jar.set(k, v.join('=')); }
  const setCookie = res?.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) { const [k, ...v] = c.split(';')[0].trim().split('='); if (k) jar.set(k, v.join('=')); }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
