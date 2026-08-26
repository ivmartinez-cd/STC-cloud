import type { ReportFormat, ReportType, ScheduleFreq } from "./scheduled-report";

/**
 * Catálogo de los 5 `REPORT_TYPES` reales (handoff hifi #3, fase 5,
 * 26/08/2026) — `GET /scheduled-reports/templates`. El mockup del handoff
 * (`Informes.dc.html`) muestra 6 plantillas con nombres de producto propios
 * ("CIERRE DE FACTURACIÓN", "AUDITORÍA DE ACCESOS") que no tienen un
 * `ReportType` real detrás — esas dos, en particular, son de otros módulos
 * (`reports`/cierres y `audit-logs`), no de `scheduled-reports`. Servir acá
 * sólo lo que `POST /scheduled-reports` puede realmente crear, con
 * descripciones fieles a lo que cada `TableBuilder` de
 * `knex-report-renderer.ts` arma — no los 6 nombres del mockup.
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
];
