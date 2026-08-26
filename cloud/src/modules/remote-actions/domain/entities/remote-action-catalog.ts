import { type RemoteAction } from "./remote-action-batch";

/**
 * Catálogo de los 5 tipos de acción remota (Fase 4.6 del gap analysis vs HP
 * SDS + RESTART_PRINTER del agente v1.2.0). Único lugar del BACKEND que
 * conoce el texto humano de cada tipo — usado para componer el banner de
 * diagnóstico de "Acciones remotas" (`GET /remote-actions/by-type`). El
 * frontend tiene su PROPIA copia de `label` (mismo criterio que
 * `STATUS_LABELS` local en el resto del portal) más subtítulo/color de UI,
 * que son puramente visuales y no pertenecen acá.
 */
export interface RemoteActionCatalogEntry {
  label: string;
  /** Motivo de negocio más probable cuando este tipo de acción falla
   * sistemáticamente — conocimiento de dominio estático (no un cálculo),
   * mostrado en el banner de diagnóstico cuando el servidor detecta una
   * falla sistémica (ver `domain/services/remote-action-insights.ts`). */
  probableCauseWhenFailing: string;
}

export const REMOTE_ACTION_CATALOG: Record<RemoteAction, RemoteActionCatalogEntry> = {
  RESCAN: {
    label: "Re-escanear red",
    probableCauseWhenFailing: "el agente no tiene alcance de red hacia los segmentos configurados (firewall o VLAN)",
  },
  FORCE_SCAN: {
    label: "Forzar lectura ahora",
    probableCauseWhenFailing: "los equipos no responden a las consultas SNMP en el rango de polling configurado",
  },
  RESTART: {
    label: "Reiniciar agente",
    probableCauseWhenFailing: "el agente no recupera la conexión con la nube después de reiniciar el servicio (proxy o firewall)",
  },
  FORCE_UPDATE: {
    label: "Forzar actualización",
    probableCauseWhenFailing: "el host no tiene salida a internet hacia el repositorio de actualizaciones",
  },
  RESTART_PRINTER: {
    label: "Reiniciar impresora (SNMP)",
    probableCauseWhenFailing: "la comunidad SNMP de escritura no está configurada en los monitores afectados",
  },
};
