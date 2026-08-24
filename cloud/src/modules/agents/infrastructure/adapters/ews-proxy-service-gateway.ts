import { waitForEwsProxyResult } from "../../../../services/ewsProxyService";
import type { EwsProxyGateway, EwsProxyResponse } from "../../application/ports/ews-proxy-gateway";

/** Adapter sobre `services/ewsProxyService.ts` (promesas pendientes resueltas por el WSS). */
export class EwsProxyServiceGateway implements EwsProxyGateway {
  waitForResult(commandId: string, agentId: string, timeoutMs: number): Promise<EwsProxyResponse> {
    return waitForEwsProxyResult(commandId, agentId, timeoutMs);
  }
}
