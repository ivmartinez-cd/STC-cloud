import { FastifyRequest } from "fastify";

/**
 * Extrae la dirección IP real del cliente. Con `trustProxy: true` configurado en
 * Fastify (server.ts), `request.ip` ya resuelve correctamente `X-Forwarded-For`
 * confiando solo en el proxy inmediato (nginx / edge de Render) en vez de aceptar
 * el header a ciegas de cualquier origen. Se recorta a 45 caracteres para no
 * desbordar los campos VARCHAR(45) de la base de datos.
 *
 * @param request - Objeto de petición de Fastify.
 * @returns IP limpia de máximo 45 caracteres.
 */
export function getClientIp(request: FastifyRequest): string {
  return (request.ip || "127.0.0.1").slice(0, 45);
}
