import { Knex } from "knex";
import type {
  CreateIncidentParams, IncidentRepository, IncidentRulePatch, ListIncidentsParams,
} from "../../domain/repositories/incident-repository";
import type { IncidentStatus } from "../../domain/entities/incident-status";
import * as reads from "./incident-reads";
import * as mutations from "./incident-mutations";
import * as rules from "./incident-rules";

/** Facade sobre `incident-{reads,mutations,rules}.ts` — mismo patrón que
 * `KnexClientRepository`: una clase que implementa el puerto de dominio
 * delegando 1:1 en funciones sueltas por archivo, para que ninguno de los
 * dos supere el límite de tamaño. */
export class KnexIncidentRepository implements IncidentRepository {
  constructor(private readonly db: Knex) {}

  listIncidents(params: ListIncidentsParams) { return reads.listIncidents(this.db, params); }
  getIncidentStats(params: { clientId?: string | null }) { return reads.getIncidentStats(this.db, params); }
  getIncident(id: string) { return reads.getIncident(this.db, id); }

  createIncident(params: CreateIncidentParams) { return mutations.createIncident(this.db, params); }
  updateIncident(id: string, patch: Record<string, unknown>, actorId?: string | null) { return mutations.updateIncident(this.db, id, patch, actorId); }
  setStatus(id: string, status: IncidentStatus, actorId?: string | null) { return mutations.setStatus(this.db, id, status, actorId); }
  closeIncident(id: string, params: { reason?: string | null; actorId?: string | null }) { return mutations.closeIncident(this.db, id, params); }
  reopenIncident(id: string, params: { reason?: string | null; actorId?: string | null }) { return mutations.reopenIncident(this.db, id, params); }
  addComment(id: string, params: { body: string; actorId?: string | null }) { return mutations.addComment(this.db, id, params); }
  assignIncident(id: string, params: { userId: string | null; actorId?: string | null }) { return mutations.assignIncident(this.db, id, params); }
  linkAlert(id: string, alertId: number, actorId?: string | null) { return mutations.linkAlert(this.db, id, alertId, actorId); }
  unlinkAlert(id: string, alertId: number, actorId?: string | null) { return mutations.unlinkAlert(this.db, id, alertId, actorId); }

  listIncidentRules(clientId: string) { return rules.listIncidentRules(this.db, clientId); }
  upsertIncidentRule(clientId: string, klass: string, patch: IncidentRulePatch) { return rules.upsertIncidentRule(this.db, clientId, klass, patch); }
  listGlobalIncidentRules() { return rules.listGlobalIncidentRules(this.db); }
  upsertGlobalIncidentRule(klass: string, patch: IncidentRulePatch) { return rules.upsertGlobalIncidentRule(this.db, klass, patch); }
}
