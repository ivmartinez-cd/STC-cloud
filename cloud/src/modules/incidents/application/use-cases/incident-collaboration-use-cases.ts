import type { IncidentRepository } from "../../domain/repositories/incident-repository";

export class AddIncidentCommentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, params: { body: string; actorId?: string | null }) { return this.repo.addComment(id, params); }
}

export class AssignIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, params: { userId: string | null; actorId?: string | null }) { return this.repo.assignIncident(id, params); }
}

export class LinkIncidentAlertUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, alertId: number, actorId?: string | null) { return this.repo.linkAlert(id, alertId, actorId); }
}

export class UnlinkIncidentAlertUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, alertId: number, actorId?: string | null) { return this.repo.unlinkAlert(id, alertId, actorId); }
}
