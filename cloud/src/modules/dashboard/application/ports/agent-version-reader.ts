export interface AgentVersionReader {
  getPublishedAgentVersion(): Promise<string>;
  /**
   * Última versión publicada POR CANAL. El parque corre dos canales a la vez
   * (`stable` y `legacy`, con runtimes distintos), así que "la publicada" no
   * es un único número: cada agente se compara contra la de su propio canal.
   */
  getPublishedVersionsByChannel(): Promise<Record<string, string>>;
}
