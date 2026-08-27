import type { IncidentRepository, IncidentRulePatch } from "../../domain/repositories/incident-repository";

export class ListIncidentRulesUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(clientId: string) { return this.repo.listIncidentRules(clientId); }
}

export class UpsertIncidentRuleUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(clientId: string, klass: string, patch: IncidentRulePatch) { return this.repo.upsertIncidentRule(clientId, klass, patch); }
}

export class ListGlobalIncidentRulesUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute() { return this.repo.listGlobalIncidentRules(); }
}

export class UpsertGlobalIncidentRuleUseCase {
  constructor(private readonly repo: IncidentRepository) {}
  execute(klass: string, patch: IncidentRulePatch) { return this.repo.upsertGlobalIncidentRule(klass, patch); }
}
