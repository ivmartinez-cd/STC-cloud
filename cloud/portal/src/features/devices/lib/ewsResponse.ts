/**
 * Decodificación y clasificación de la respuesta del proxy EWS remoto
 * (`POST /agents/:id/ews-proxy`). Lógica pura — sin React, sin DOM, sin red —
 * para poder testearla con `node --test` (ver `cloud/portal/tests/ewsResponse.test.ts`).
 *
 * El cuerpo viaja en Base64 de punta a punta a propósito: el agente nunca hace
 * `toString('utf8')` porque corrompía el contenido binario de la EWS (imágenes
 * del panel, PDFs de reportes). Acá es el primer punto donde se decide cómo
 * interpretar esos bytes, y por eso la decisión NO se delega al navegador: se
 * mira el `content-type` que mandó el firmware y, si no mandó ninguno (pasa en
 * EWS viejos), se olfatean los bytes.
 */

export interface EwsProxyResponse {
  status: number;
  headers: Record<string, string>;
  body_base64: string;
  truncated: boolean;
}

/** Cómo mostrar el cuerpo: página navegable, texto plano, imagen o descarga. */
export type EwsBodyKind = 'html' | 'text' | 'image' | 'binary';

/** Headers en minúscula-insensible: el firmware puede mandar `Content-Type` o `content-type`. */
function headerValue(headers: Record<string, string> | undefined, name: string): string {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return String(value ?? '');
  }
  return '';
}

/** `content-type` en minúsculas y sin parámetros; `''` si el firmware no lo mandó. */
export function contentTypeOf(headers: Record<string, string> | undefined): string {
  return headerValue(headers, 'content-type').split(';')[0].trim().toLowerCase();
}

/**
 * Charset declarado por el equipo. Los EWS de Samsung/Lexmark viejos sirven
 * `iso-8859-1`: decodificarlos como UTF-8 rompe los acentos de la ubicación y
 * del nombre que cargó el cliente, justo los campos que el operador viene a leer.
 */
export function charsetOf(headers: Record<string, string> | undefined): string {
  const match = /charset\s*=\s*["']?([\w-]+)/i.exec(headerValue(headers, 'content-type'));
  return match ? match[1].toLowerCase() : 'utf-8';
}

export function decodeBase64(bodyBase64: string): Uint8Array {
  const binary = atob(bodyBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cae a UTF-8 si el equipo declaró un charset que el navegador no conoce (`TextDecoder` tira `RangeError`). */
export function decodeText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const TEXTUAL_TYPES = /^application\/(json|xml|javascript|x-javascript|xhtml\+xml)$/;

/** Sin `content-type` utilizable: HTML si arranca con marcado, texto si son bytes imprimibles, binario si no. */
function sniffKind(bytes: Uint8Array): EwsBodyKind {
  const head = decodeText(bytes.slice(0, 512), 'utf-8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  const sample = bytes.slice(0, 1024);
  const printable = sample.every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127));
  return printable ? 'text' : 'binary';
}

export function bodyKind(contentType: string, bytes: Uint8Array): EwsBodyKind {
  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') return 'html';
  // SVG incluido: dentro de un `<img>` el navegador no ejecuta su script.
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('text/') || TEXTUAL_TYPES.test(contentType)) return 'text';
  if (contentType.endsWith('+xml') || contentType.endsWith('+json')) return 'text';
  if (contentType === '') return sniffKind(bytes);
  return 'binary';
}

/**
 * CSP del iframe de vista renderizada. `default-src 'none'` es lo que impide
 * que la página del equipo salga a buscar sus propios CSS/JS/imágenes: el proxy
 * trae UNA página, no sus recursos, así que esas URLs relativas se resolverían
 * contra el origen del portal y terminarían pidiéndole `index.html` a nuestro
 * propio servidor. Con `sandbox=""` en el iframe (sin `allow-scripts` ni
 * `allow-same-origin`) el contenido del cliente no puede ejecutar nada ni tocar
 * la sesión del portal.
 */
const RENDER_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

/**
 * `<base href="about:blank">` además de la CSP: sin él, un link relativo del
 * firmware seguiría resolviendo contra el origen del portal si algún día se
 * relajara el sandbox.
 */
export function sandboxedSrcDoc(html: string): string {
  return `<!doctype html><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}">`
    + `<base href="about:blank">${html}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Nombre para "Descargar": último segmento de la ruta consultada, o `ews.bin`. */
export function downloadNameFor(path: string): string {
  const last = path.split('?')[0].split('/').filter(Boolean).pop();
  return last && /\.[a-z0-9]{1,8}$/i.test(last) ? last : 'ews.bin';
}

/** Familia del código de estado, para pintar el badge sin repetir rangos en el JSX. */
export function statusTone(status: number): 'ok' | 'redirect' | 'client' | 'server' {
  if (status < 300) return 'ok';
  if (status < 400) return 'redirect';
  if (status < 500) return 'client';
  return 'server';
}
