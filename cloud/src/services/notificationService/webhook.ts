import dns from "dns";
import net from "net";

/** Rangos privados/loopback/link-local IPv4 relevantes para el guard SSRF de abajo. */
function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // formato raro → rechazar
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local — incluye 169.254.169.254 (metadata de nube)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrLoopbackIPv4(mapped[1]);
  return false;
}

/**
 * Guard SSRF: la URL del webhook la carga el operador vía `PUT /clients/:id` y el
 * SERVIDOR hace la petición saliente — misma superficie que ya se trató en
 * "Seguridad mínima" (mass assignment de `createClient`). Sólo `https:`, y se
 * resuelve el hostname para rechazar loopback/privado/link-local ANTES de
 * conectar (no alcanza con mirar el hostname literal: un atacante puede apuntar
 * un dominio propio a `169.254.169.254`).
 */
async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL de webhook inválida");
  }
  if (url.protocol !== "https:") {
    throw new Error("El webhook debe ser https");
  }

  // `URL.hostname` conserva los corchetes para un literal IPv6 (`"[::1]"`) —
  // `net.isIP()` no los reconoce con corchetes y el hostname caía al branch de
  // DNS, donde una resolución de "[::1]" como si fuera un nombre de dominio
  // fallaba con ENOTFOUND en vez de ser rechazado como loopback.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    const unsafe = net.isIP(hostname) === 6 ? isPrivateOrLoopbackIPv6(hostname) : isPrivateOrLoopbackIPv4(hostname);
    if (unsafe) throw new Error("El webhook apunta a una dirección de red interna");
    return url;
  }

  const resolved = await dns.promises.lookup(hostname, { all: true });
  for (const { address, family } of resolved) {
    const unsafe = family === 6 ? isPrivateOrLoopbackIPv6(address) : isPrivateOrLoopbackIPv4(address);
    if (unsafe) throw new Error(`El webhook resuelve a una dirección de red interna (${address})`);
  }
  return url;
}

/**
 * POST genérico contra un webhook — reusado por alertas, cierres e
 * integración ERP. Un solo intento acá (BullMQ da reintento/backoff a nivel
 * de job — ver los `.add(..., {attempts,backoff})` de cada enqueuer), timeout
 * corto, sin seguir redirects (una 3xx a una URL privada burlaría el guard
 * SSRF si se siguiera automáticamente).
 *
 * Bug real (25/08/2026): `fetch` sólo rechaza la promesa ante una falla de
 * RED — una respuesta 4xx/5xx del receptor es una promesa resuelta como
 * cualquier otra, así que el catch de cada worker nunca la veía y una
 * entrega fallida quedaba indistinguible de una exitosa (nunca se
 * reintentaba, aunque BullMQ ya tuviera el mecanismo listo). Se agrega el
 * chequeo de `res.ok` explícito.
 */
export async function postWebhook(
  webhookUrl: string,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const url = await assertSafeWebhookUrl(webhookUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Webhook respondió ${res.status} ${res.statusText}`);
  }
}
