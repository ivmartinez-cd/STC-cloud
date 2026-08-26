import type { ReportFormat, ReportType, ScheduleFreq } from "./scheduled-report";

/**
 * Catálogo de los 7 `REPORT_TYPES` reales — `GET /scheduled-reports/templates`.
 * Las 2 últimas ("Cierre de facturación", "Auditoría de accesos") fueron el
 * gap real del mockup del handoff hifi #3 (fase 5, 26/08/2026: sólo servía
 * 5, sin `ReportType` detrás de esas 2) — cerrado post-verificación con
 * `billingClosureTable`/`auditExportTable` en `knex-report-renderer.ts`,
 * que sí las respaldan de verdad. Descripciones fieles a lo que cada
 * `TableBuilder` arma.
 */
export interface ReportTemplate {
  reportType: ReportType;
  label: string;
  description: string;
  defaultFormat: ReportFormat;
  defaultParams: Record<string, unknown>;
  suggestedFrequency: ScheduleFreq;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    reportType: "usage",
    label: "Consumo por cliente",
    description: "Volumen monocromo y color del período por equipo, con el total del cliente.",
    defaultFormat: "xlsx",
    defaultParams: {},
    suggestedFrequency: "monthly",
  },
  {
    reportType: "non_contactable",
    label: "Equipos no contactables",
    description: "Equipos sin lectura reciente (umbral configurable de días sin señal).",
    defaultFormat: "csv",
    defaultParams: { offline_days: 3 },
    suggestedFrequency: "weekly",
  },
  {
    reportType: "consumable_levels",
    label: "Niveles de consumibles",
    description: "Ítems de consumible por debajo de un porcentaje o de días restantes, listos para reponer.",
    defaultFormat: "csv",
    defaultParams: {},
    suggestedFrequency: "weekly",
  },
  {
    reportType: "asset_list",
    label: "Inventario de equipos",
    description: "Listado completo de equipos gestionados con marca, modelo, sede y estado.",
    defaultFormat: "xlsx",
    defaultParams: {},
    suggestedFrequency: "monthly",
  },
  {
    reportType: "alert_history",
    label: "Historial de alertas",
    description: "Alertas de una clase (o todas) en una ventana de días, con severidad y equipo.",
    defaultFormat: "csv",
    defaultParams: { days: 7 },
    suggestedFrequency: "daily",
  },
  {
    reportType: "billing_closure",
    label: "Cierre de facturación",
    description: "El último cierre mensual OFICIAL del cliente, con el detalle por equipo tal como quedó facturado.",
    defaultFormat: "xlsx",
    defaultParams: {},
    suggestedFrequency: "monthly",
  },
  {
    reportType: "audit_export",
    label: "Auditoría de accesos",
    description: "Inicios de sesión (exitosos y fallidos) y eventos de 2FA en una ventana de días.",
    defaultFormat: "csv",
    defaultParams: { days: 30 },
    suggestedFrequency: "weekly",
  },
];
