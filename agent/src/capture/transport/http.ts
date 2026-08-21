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

/** Extrae pares `nombre=valor` de `Set-Cookie` y los fusiona sobre una cookie previa. */
export function mergeCookies(previous: string, res: HttpResponse | null): string {
  const jar = new Map<string, string>();
  for (const kv of previous.split(';')) { const [k, ...v] = kv.trim().split('='); if (k) jar.set(k, v.join('=')); }
  const setCookie = res?.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) { const [k, ...v] = c.split(';')[0].trim().split('='); if (k) jar.set(k, v.join('=')); }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
