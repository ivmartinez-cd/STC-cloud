export interface EwsProxyResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  truncated: boolean;
}

/** Espera el resultado de un comando `EWS_PROXY` que el agente devuelve por WSS (`services/ewsProxyService.ts`). */
export interface EwsProxyGateway {
  waitForResult(commandId: string, agentId: string, timeoutMs: number): Promise<EwsProxyResponse>;
}
