import type { Knex } from "knex";
import type { Scope } from "../../utils/scope";
import { ALERT_CLASS_LABELS, RESPONDER_LABELS } from "../../../services/alertCatalog";

export const ALERT_CLASS_IDS = new Set(Object.keys(ALERT_CLASS_LABELS));
export const RESPONDER_IDS = new Set(Object.keys(RESPONDER_LABELS));

export interface AlertQueryFilters {
  deviceId?: string;
  clientId?: string;
  severity?: string;
  type?: string;
  alertClasses?: string[];
  responders?: string[];
  resolved?: string;
  acknowledged?: string;
}

/**
 * LEFT JOIN triple + scoping por cliente de las alertas, factorizado de
 * `getAlerts` (Fase 1 del gap analysis vs HP SDS) para que `getAlertSummary` y
 * el desglose del dashboard (Fase 6) no reimplementen sus tres sutilezas: (a)
 * LEFT JOIN — no inner — porque una alerta agent-scoped (`agent_offline`) no
 * tiene `device_id`; (b) `agents` se resuelve por
 * `COALESCE(devices.agent_id, alerts.agent_id)` para cubrir ambos casos con un
 * solo join; (c) excluye lápidas de fusión (`devices.merged_into`) pero NO
 * bajas (`decommissioned_at` sigue apareciendo — su historial de alertas sigue
 * siendo válido). No incluye `.select()` ni `.limit()/.offset()` — cada caller
 * agrega lo suyo.
 */
export function buildScopedAlertQuery(db: Knex, scope: Scope, filters: AlertQueryFilters): Knex.QueryBuilder {
  const query = db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
    .leftJoin("clients", "agents.client_id", "clients.id")
    .andWhere((b) => {
      b.whereNull("devices.id").orWhereNull("devices.merged_into");
    })
    .modify((q) => {
      if (scope.kind === "client") {
        q.andWhere((b) => {
          b.where("devices.client_id", scope.id).orWhere((b2) => {
            b2.whereNull("devices.id").andWhere("agents.client_id", scope.id);
          });
        });
      }
    });

  if (filters.deviceId) query.where("alerts.device_id", filters.deviceId);
  if (filters.clientId) {
    query.andWhere((b) => {
      b.where("devices.client_id", filters.clientId).orWhere((b2) => {
        b2.whereNull("devices.id").andWhere("agents.client_id", filters.clientId);
      });
    });
  }
  if (filters.severity) query.where("alerts.severity", filters.severity);
  if (filters.type) query.where("alerts.type", filters.type);
  if (filters.alertClasses?.length) query.whereIn("alerts.alert_class", filters.alertClasses);
  if (filters.responders?.length) query.whereIn("alerts.responder", filters.responders);
  if (filters.resolved === "true") query.where("alerts.resolved", true);
  else if (filters.resolved === "false") query.where("alerts.resolved", false);
  if (filters.acknowledged === "true") query.where("alerts.acknowledged", true);
  else if (filters.acknowledged === "false") query.where("alerts.acknowledged", false);

  return query;
}

/** Valida una lista CSV de query param contra un set de ids válidos; 400 si alguno no matchea. */
export function parseCsvOrThrow(raw: string | undefined, validIds: Set<string>, paramName: string): string[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const invalid = values.filter((v) => !validIds.has(v));
  if (invalid.length > 0) {
    throw Object.assign(new Error(`${paramName} inválido: ${invalid.join(", ")}`), { statusCode: 400 });
  }
  return values;
}
