/**
 * Traducción HTTP entre el navegador del operador y la EWS del equipo, para el
 * gateway de EWS remoto. Funciones puras (sin Fastify, sin Redis, sin red):
 * son las decisiones finas que hacen que una web embebida escrita en 2009
 * funcione servida desde otro origen, y donde es fácil abrir un agujero.
 *
 * El gateway vive en un HOSTNAME PROPIO (`ews.<dominio>`), no en un prefijo
 * del portal. Ese es el motivo de que no haya reescritura de HTML ni de
 * JavaScript en todo esto: como el origen es sólo para el EWS, las rutas
 * absolutas del firmware (`/sws/app/…`, típicas de Samsung) resuelven solas
 * contra el gateway. Reescribir el JS de cada marca sería frágil y se rompería
 * con cada firmware nuevo.
 */

/** nginx mapea `ews.<dominio>/<lo que sea>` a esta ruta de la API. */
export const GATEWAY_PREFIX = "/__ews";

/** Ruta que el navegador pide, ya sin el prefijo interno; siempre arranca con "/". */
export function pathFromUrl(url: string): string {
  const path = url.startsWith(GATEWAY_PREFIX) ? url.slice(GATEWAY_PREFIX.length) : url;
  return path.startsWith("/") ? path : `/${path}`;
}

export function isWriteMethod(method: string): boolean {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

/** Una navegación (lo que se audita) vs. un recurso de la página: se distingue por el `Accept` del navegador. */
export function isNavigation(headers: Record<string, unknown>): boolean {
  return String(headers["accept"] ?? "").includes("text/html");
}

/**
 * Headers del navegador que NO se le reenvían al equipo. Blocklist y no
 * allowlist, que es como se comporta un proxy de verdad: el firmware puede
 * depender de cualquier cabecera, y adivinar cuáles sirven ya salió mal.
 *
 * El caso que lo motivó (13/09/2026): con una allowlist de cinco cabeceras se
 * perdía `X-Requested-With`, que es lo que manda jQuery en cada AJAX. El
 * SyncThru de ISSN lo usa para distinguir una llamada de datos de una
 * navegación: sin esa cabecera contestaba 302 hacia la home en vez del JSON, y
 * la app se quedaba para siempre en "Loading...".
 *
 * Lo que sí queda afuera y por qué:
 * - `cookie` del navegador: la única que el equipo ve es la del jar de la
 *   sesión, que vive del lado del servidor. La del navegador identifica la
 *   sesión del gateway y no es asunto de la impresora.
 * - `user-agent` y `accept-encoding`: las pone el agente, que es quien hace la
 *   conexión real.
 * - Las de nuestra infraestructura (`x-forwarded-*`): no tienen por qué
 *   revelarle al equipo del cliente dónde vive la nube.
 *
 * `authorization` SÍ viaja: es lo que hace que el Basic auth de Lexmark/HP
 * funcione de punta a punta, con el prompt del propio navegador y sin que la
 * credencial pase por ninguna pantalla nuestra. Y `referer`/`origin` se
 * reescriben a la URL del equipo, porque hay firmware que valida el Referer
 * como defensa anti-CSRF.
 */
const BLOCKED_REQUEST_HEADERS = new Set([
  // De la conexión, no del mensaje.
  "connection", "keep-alive", "proxy-authorization", "proxy-authenticate", "te", "trailer",
  "transfer-encoding", "upgrade", "host", "content-length",
  // Las pone el agente: el `Cookie` sale del jar de la sesión y el resto son suyos.
  "cookie", "accept-encoding", "user-agent",
  // De nuestra infraestructura — no tienen por qué llegarle al equipo del cliente.
  "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-real-ip",
]);

export function requestHeadersFor(
  browserHeaders: Record<string, unknown>,
  cookieJar: string,
  deviceOrigin: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(browserHeaders)) {
    if (BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    if (typeof value === "string" && value !== "") out[name.toLowerCase()] = value;
  }
  if (cookieJar) out["cookie"] = cookieJar;
  if (typeof browserHeaders["referer"] === "string") out["referer"] = rewriteToDevice(browserHeaders["referer"], deviceOrigin);
  if (typeof browserHeaders["origin"] === "string") out["origin"] = deviceOrigin;
  return out;
}

/** `https://ews.example/sws/x` → `http://10.0.0.5/sws/x` (se conserva la ruta, cambia el origen). */
function rewriteToDevice(url: string, deviceOrigin: string): string {
  try {
    const parsed = new URL(url);
    return `${deviceOrigin}${parsed.pathname}${parsed.search}`;
  } catch {
    return deviceOrigin;
  }
}

/**
 * Headers de la respuesta del equipo que vuelven al navegador.
 *
 * `set-cookie` NUNCA está acá: el agente ya lo devuelve por separado y lo
 * guarda la sesión. Si se reenviara, la cookie de administración del equipo
 * quedaría en el navegador del operador —y accesible a cualquier pestaña de
 * ese origen— que es justo lo que este diseño evita.
 *
 * Se quitan también las políticas del propio firmware que asumen que la página
 * se sirve desde el equipo: un `Content-Security-Policy` o un
 * `X-Frame-Options` de 2009 apuntando a la IP de la impresora sólo puede
 * romper la página servida desde el gateway.
 */
const DROPPED_RESPONSE_HEADERS = new Set([
  "set-cookie", "connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length",
  "content-security-policy", "content-security-policy-report-only", "x-frame-options", "strict-transport-security",
  "public-key-pins", "alt-svc",
]);

export function responseHeadersFor(deviceHeaders: Record<string, string>, deviceOrigin: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(deviceHeaders)) {
    const name = key.toLowerCase();
    if (DROPPED_RESPONSE_HEADERS.has(name)) continue;
    out[name] = name === "location" ? rewriteLocation(value, deviceOrigin) : value;
  }
  return out;
}

/**
 * Un `Location` absoluto hacia el propio equipo (`http://10.0.0.5/sws/…`, que
 * es lo que devuelve el 302 de la home de Samsung) se convierte en una ruta
 * relativa para que el navegador la siga DENTRO del gateway. Si no, el
 * navegador intentaría ir a la IP de la LAN del cliente y no llegaría a
 * ninguna parte. Un `Location` hacia otro host se deja intacto: no es asunto
 * del gateway redirigir a terceros.
 */
export function rewriteLocation(location: string, deviceOrigin: string): string {
  if (location.startsWith("/")) return location;
  try {
    const parsed = new URL(location);
    const device = new URL(deviceOrigin);
    if (parsed.hostname !== device.hostname) return location;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return location;
  }
}
