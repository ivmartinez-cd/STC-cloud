export interface EwsProxyResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  truncated: boolean;
}

/** Empuja y espera el resultado de un comando `EWS_PROXY` (`services/ewsProxyService.ts` + relay multi-réplica de `ws/index.ts`). */
export interface EwsProxyGateway {
  /**
   * Entrega el comando al agente: local si su socket está en esta réplica, o
   * por relay a la réplica que lo tenga. `false` sólo si el agente no está
   * conectado a NINGUNA réplica (fail-fast real) — el caller debe tratarlo
   * como "no conectado", no reintentar `waitForResult`.
   */
  pushCommand(agentId: string, commandId: string, payload: Record<string, unknown>): Promise<boolean>;
  waitForResult(commandId: string, agentId: string, timeoutMs: number): Promise<EwsProxyResponse>;
}
