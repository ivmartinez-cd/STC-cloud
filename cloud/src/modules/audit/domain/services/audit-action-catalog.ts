/**
 * Traduce `audit_logs.action` (código interno tipo `DEVICE_MOVED`) a un label
 * legible en español + categoría, para el feed de "Movimientos y cambios"
 * (Fase 3 del gap analysis vs HP SDS — `docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md`).
 * Puro (sin Knex/Fastify), mismo criterio que `alertCatalog.ts`/`rolePolicy.ts`.
 *
 * Cubre las ~25 acciones que existen hoy en el código (`grep -rn 'action:'
 * cloud/src/api cloud/src/services`) — una acción que falte acá no rompe nada,
 * `auditActionMeta()` devuelve un fallback legible (el propio código, categoría
 * `other`), así que este catálogo puede quedar desactualizado sin que el feed
 * se rompa.
 */

export type AuditCategory = "device" | "agent" | "client" | "security" | "alert" | "report" | "user" | "other";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  device: "Dispositivos",
  agent: "Agentes",
  client: "Clientes",
  security: "Seguridad",
  alert: "Alertas",
  report: "Reportes",
  user: "Usuarios",
  other: "Otro",
};

interface AuditActionMeta {
  label: string;
  category: AuditCategory;
}

const AUDIT_ACTION_META: Record<string, AuditActionMeta> = {
  // Dispositivos
  DEVICE_UPDATED: { label: "Equipo editado", category: "device" },
  DEVICE_DECOMMISSIONED: { label: "Equipo dado de baja", category: "device" },
  DEVICE_RECOMMISSIONED: { label: "Equipo reactivado", category: "device" },
  DEVICE_MOVED: { label: "Equipo movido de sede", category: "device" },
  DEVICE_MERGED: { label: "Duplicados fusionados", category: "device" },
  DEVICE_DELETED: { label: "Equipo eliminado", category: "device" },
  // "Baja masiva" cubre dos disparadores desde la Fase 9 (acciones en bloque):
  // por inactividad (`decommissionStaleDevices`) y por selección manual
  // (`deviceLifecycleService.bulkDecommission`) — mismo `action`, se
  // distinguen en `metadata` (`inactive_days` sólo está presente en el primero).
  DEVICES_BULK_DECOMMISSIONED: { label: "Baja masiva de equipos", category: "device" },
  DEVICES_BULK_RECOMMISSIONED: { label: "Reactivación masiva de equipos", category: "device" },
  DEVICES_BULK_MOVED: { label: "Movimiento masivo de equipos", category: "device" },
  ALERTS_BULK_UPDATED: { label: "Alertas actualizadas en bloque", category: "alert" },
  DEVICE_IP_REASSIGNED: { label: "IP reasignada (colisión DHCP)", category: "device" },
  DEVICE_AGENT_REASSIGNED: { label: "Equipo reasignado de agente", category: "device" },
  DEVICE_MONITOR_STATE_CHANGED: { label: "Estado de monitoreo cambiado", category: "device" },
  DEVICE_REGISTERED: { label: "Equipo registrado desde la cola de pendientes", category: "device" },
  DEVICE_IGNORED: { label: "Equipo ignorado", category: "device" },
  DEVICE_UNIGNORED: { label: "Equipo vuelto a pendiente", category: "device" },

  // Agentes
  AGENT_CREATED: { label: "Agente creado", category: "agent" },
  AGENT_ACTIVATED: { label: "Agente activado", category: "agent" },
  AGENT_DELETED: { label: "Agente eliminado", category: "agent" },
  AGENT_COMMAND: { label: "Comando enviado al agente", category: "agent" },
  AGENT_SNMP_CREDENTIALS_UPDATED: { label: "Credenciales SNMP actualizadas", category: "agent" },
  UPDATE_CONFIG: { label: "Configuración del agente actualizada", category: "agent" },
  REGENERATE_KEY: { label: "Llave de activación regenerada", category: "agent" },
  REVOKE_TOKEN: { label: "Agente revocado", category: "agent" },
  REMOTE_EWS_ACCESS: { label: "Acceso remoto a EWS", category: "agent" },
  REMOTE_EWS_TOGGLE: { label: "Acceso remoto a EWS habilitado/deshabilitado", category: "agent" },

  // Clientes
  CLIENT_CREATED: { label: "Cliente creado", category: "client" },
  CLIENT_UPDATED: { label: "Cliente editado", category: "client" },

  // Usuarios / seguridad
  USER_LOGIN_SUCCESS: { label: "Inicio de sesión", category: "security" },
  USER_LOGIN_FAILED: { label: "Intento de inicio de sesión fallido", category: "security" },
  USER_CREATED: { label: "Usuario creado", category: "user" },
  USER_UPDATED: { label: "Usuario editado", category: "user" },
  USER_DELETED: { label: "Usuario eliminado", category: "user" },
  USER_2FA_ENABLED: { label: "2FA activado", category: "user" },
  USER_2FA_DISABLED: { label: "2FA desactivado", category: "user" },
  USER_2FA_RECOVERY_USED: { label: "Código de recuperación 2FA usado", category: "user" },
  USER_2FA_RECOVERY_REGENERATED: { label: "Códigos de recuperación 2FA regenerados", category: "user" },

  // Alertas
  ALERT_ACKNOWLEDGED: { label: "Alerta reconocida", category: "alert" },
  ALERT_RESOLVED: { label: "Alerta resuelta", category: "alert" },
  ALERT_ACK_AND_RESOLVE: { label: "Alerta reconocida y resuelta", category: "alert" },

  // Reportes
  REPORT_PERIOD_CLOSED: { label: "Período de facturación cerrado", category: "report" },
  REPORT_PERIOD_REOPENED: { label: "Período de facturación reabierto", category: "report" },

  // Sistema
  SYSTEM_SETTINGS_UPDATED: { label: "Ajustes del sistema actualizados", category: "other" },

  // Otro
  REPORT_BUG: { label: "Reporte de bug enviado", category: "other" },
  SUGGEST_ENHANCEMENT: { label: "Sugerencia enviada", category: "other" },
  UPDATE_FEEDBACK_STATUS: { label: "Estado de feedback actualizado", category: "other" },
};

/** Nunca falla: una acción desconocida devuelve el propio código como label. */
export function auditActionMeta(action: string): AuditActionMeta {
  return AUDIT_ACTION_META[action] ?? { label: action, category: "other" };
}

export function listAuditActionCatalog(): Array<{ action: string; label: string; category: AuditCategory }> {
  return Object.entries(AUDIT_ACTION_META).map(([action, meta]) => ({ action, ...meta }));
}
