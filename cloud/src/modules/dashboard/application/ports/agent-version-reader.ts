export interface AgentVersionReader {
  getPublishedAgentVersion(): Promise<string>;
}
