/**
 * "Correo" (handoff hifi #3, 26/08/2026) — el banner de diagnóstico necesita
 * distinguir DOS causas de "0 entregados": clientes sin `notification_email`
 * configurado (no hay a quién mandarle) vs. destinatario válido que falla por
 * falta de servidor SMTP. `clientesSinContacto` sale de `clients`, no de
 * `email_log` — es "cuántos clientes no pueden recibir un aviso hoy", no
 * "cuántos intentos fallaron por esta causa en la ventana" (evita doble
 * conteo si un mismo cliente sin contacto generó varios intentos).
 * `reintentos` es siempre 0: no existe cola de reintentos en
 * `services/notificationService/mailer.ts` — un envío fallido no se
 * reintenta solo. Es el número real, no un placeholder.
 */
export interface EmailLogSummary {
  intentos: number;
  entregados: number;
  sinDestinatario: number;
  sinSmtp: number;
  clientesSinContacto: number;
  clientesTotal: number;
  reintentos: number;
}
