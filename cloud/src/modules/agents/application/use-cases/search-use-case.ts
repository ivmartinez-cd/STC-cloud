export interface GlobalSearchRepository {
  /** `clientId` (client_viewer) acota clientes y equipos; `null` = sin restricción. */
  search(query: string, clientId: string | null): Promise<{ clients: unknown[]; devices: unknown[] }>;
}

/** Buscador global (clientes + dispositivos) del portal — movido de `AgentSearchService`. */
export class GlobalSearchUseCase {
  constructor(private readonly repo: GlobalSearchRepository) {}
  execute(query: string, clientId: string | null = null) {
    return this.repo.search(query, clientId);
  }
}
