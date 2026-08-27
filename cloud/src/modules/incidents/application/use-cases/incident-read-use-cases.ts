import type { IncidentRepository, ListIncidentsParams } from "../../domain/repositories/incident-repository";

export class ListIncidentsUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(params: ListIncidentsParams) { return this.repo.listIncidents(params); }
}

export class GetIncidentStatsUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(params: { clientId?: string | null }) { return this.repo.getIncidentStats(params); }
}

export class GetIncidentUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(id: string) { return this.repo.getIncident(id); }
}
