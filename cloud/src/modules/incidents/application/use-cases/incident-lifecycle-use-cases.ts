import type { CreateIncidentParams, IncidentRepository } from "../../domain/repositories/incident-repository";
import type { IncidentStatus } from "../../domain/entities/incident-status";

export class CreateIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(params: CreateIncidentParams) { return this.repo.createIncident(params); }
}

export class UpdateIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, patch: Record<string, unknown>, actorId?: string | null) { return this.repo.updateIncident(id, patch, actorId); }
}

export class SetIncidentStatusUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, status: IncidentStatus, actorId?: string | null) { return this.repo.setStatus(id, status, actorId); }
}

export class CloseIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, params: { reason?: string | null; actorId?: string | null }) { return this.repo.closeIncident(id, params); }
}

export class ReopenIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string, params: { reason?: string | null; actorId?: string | null }) { return this.repo.reopenIncident(id, params); }
}
