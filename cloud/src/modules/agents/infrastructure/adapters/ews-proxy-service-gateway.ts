import { waitForEwsProxyResult } from "../../../../services/ewsProxyService";
import { pushEwsProxyCommand } from "../../../../ws/index";
import type { EwsProxyGateway, EwsProxyResponse } from "../../application/ports/ews-proxy-gateway";

/** Adapter sobre `services/ewsProxyService.ts` + `ws/index.ts` (promesas pendientes resueltas por el WSS, push local o por relay). */
export class EwsProxyServiceGateway implements EwsProxyGateway {
  pushCommand(agentId: string, commandId: string, payload: Record<string, unknown>): Promise<boolean> {
    return pushEwsProxyCommand(agentId, commandId, payload);
  }

  waitForResult(commandId: string, agentId: string, timeoutMs: number): Promise<EwsProxyResponse> {
    return waitForEwsProxyResult(commandId, agentId, timeoutMs);
  }
}
