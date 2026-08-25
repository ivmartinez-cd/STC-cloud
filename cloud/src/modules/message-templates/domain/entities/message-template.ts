/**
 * Dominio de plantillas de mensajes (Fase 4.3 del gap analysis vs HP SDS).
 * Puro. Los DEFAULTS calcan los textos que `notificationService` armaba
 * hardcodeados — si no hay fila en la base, el mail sale idéntico a antes.
 */

export const TEMPLATE_EVENTS = [
  "alert.created",
  "incident.created",
  "supply_request.created",
  "supply_request.completed",
  "report.closed",
  "alert.digest",
] as const;
export type TemplateEvent = (typeof TEMPLATE_EVENTS)[number];

export interface MessageTemplate {
  id: string;
  clientId: string | null;
  event: TemplateEvent;
  subject: string;
  body: string;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface TemplateContent {
  subject: string;
  body: string;
}

/** Placeholders disponibles por evento (documentación para la UI y validación blanda). */
export const EVENT_PLACEHOLDERS: Record<TemplateEvent, string[]> = {
  "alert.created": ["client_name", "target", "type", "message", "severity"],
  "incident.created": ["client_name", "number", "title", "class", "severity", "device_label"],
  "supply_request.created": ["client_name", "device_serial", "supply", "level_pct"],
  "supply_request.completed": ["client_name", "device_serial", "supply", "level_pct"],
  "report.closed": ["client_name", "period", "total_pages"],
  "alert.digest": ["client_name", "critical_count", "warning_count", "opened_24h", "top_classes"],
};

export const DEFAULT_TEMPLATES: Record<TemplateEvent, TemplateContent> = {
  "alert.created": {
    subject: "[STC Cloud] Alerta crítica — {{client_name}}",
    body: "Cliente: {{client_name}}\nOrigen: {{target}}\nTipo: {{type}}\nMensaje: {{message}}\n",
  },
  "incident.created": {
    subject: "[STC Cloud] Incidente #{{number}} — {{client_name}}",
    body:
      "Se abrió un incidente.\n\nCliente: {{client_name}}\nNº: {{number}}\n" +
      "Título: {{title}}\nClase: {{class}}\nSeveridad: {{severity}}\nEquipo: {{device_label}}\n",
  },
  "supply_request.created": {
    subject: "[STC Cloud] Pedido de consumible nuevo — {{client_name}}",
    body:
      "Se ha generado un pedido de consumible.\n\nCliente: {{client_name}}\n" +
      "Equipo: {{device_serial}}\nConsumible: {{supply}}\nNivel al abrir: {{level_pct}}\n",
  },
  "supply_request.completed": {
    subject: "[STC Cloud] Pedido de consumible completado — {{client_name}}",
    body:
      "Se ha completado (consumible reemplazado) un pedido de consumible.\n\n" +
      "Cliente: {{client_name}}\nEquipo: {{device_serial}}\nConsumible: {{supply}}\n",
  },
  "report.closed": {
    subject: "[STC Cloud] Cierre mensual {{period}} — {{client_name}}",
    body:
      "Cliente: {{client_name}}\nPeríodo: {{period}}\nTotal de páginas: {{total_pages}}\n\n" +
      "Se adjunta el detalle del cierre (CSV/XLSX).",
  },
  "alert.digest": {
    subject: "[STC Cloud] Resumen diario de alertas — {{client_name}}",
    body:
      "Resumen de alertas de {{client_name}}.\n\n" +
      "Abiertas actualmente: {{critical_count}} crítica(s), {{warning_count}} de advertencia.\n" +
      "Nuevas en las últimas 24h: {{opened_24h}}.\n" +
      "Principales clases: {{top_classes}}\n",
  },
};

/**
 * Reemplaza `{{clave}}` por su valor. Placeholder sin valor → "—" (nunca
 * queda el literal `{{...}}` en el mail). Texto plano, sin escapes.
 */
export function renderTemplate(content: TemplateContent, vars: Record<string, string | number | null>): TemplateContent {
  const substitute = (text: string): string =>
    // `[a-z0-9_]+` (no sólo `[a-z_]+`): `alert.digest` introdujo el primer
    // placeholder con dígito (`opened_24h`) — sin el rango numérico, ese
    // `{{opened_24h}}` nunca matcheaba y quedaba literal en el mail (bug real,
    // atrapado por el test "los defaults calcan los eventos y renderizan
    // completos" de messageTemplates.test.ts).
    text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const value = vars[key];
      return value == null || value === "" ? "—" : String(value);
    });
  return { subject: substitute(content.subject), body: substitute(content.body) };
}

/** ¿El cliente tiene habilitado este evento? (jsonb `clients.notification_events`). */
export function eventEnabledFor(notificationEvents: unknown, event: TemplateEvent): boolean {
  if (!Array.isArray(notificationEvents)) return true; // fila vieja/valor raro → comportamiento histórico
  return notificationEvents.includes(event);
}
