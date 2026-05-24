import { FastifyRequest } from "fastify";

/**
 * Extrae la dirección IP real del cliente desde la petición, manejando correctamente
 * las cabeceras de proxy múltiple como 'x-forwarded-for' de Vercel/Render y recortando
 * a 45 caracteres para evitar desbordar los campos VARCHAR(45) de la base de datos.
 *
 * @param request - Objeto de petición de Fastify.
 * @returns IP limpia de máximo 45 caracteres.
 */
export function getClientIp(request: FastifyRequest): string {
  const xForwardedFor = request.headers["x-forwarded-for"];
  if (xForwardedFor) {
    const list = typeof xForwardedFor === "string" ? xForwardedFor : xForwardedFor[0];
    if (list) {
      const firstIp = list.split(",")[0].trim();
      return firstIp.slice(0, 45);
    }
  }
  return (request.ip || "127.0.0.1").slice(0, 45);
}
