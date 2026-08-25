/** Query string cruda de `GET /agents/:id/devices/directory` (handoff hifi "Monitor
 * — detalle", 25/08/2026) — mismo criterio "tolerante" que `ListClientDeviceDirectoryInput`
 * en el módulo `clients`. */
export interface ListAgentDeviceDirectoryInput {
  agentId: string;
  q?: string;
  segment?: string;
  sortField?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}
