import { waitForEwsProxyResult } from "../../../../services/ewsProxyService";
import { pushEwsProxyCommand } from "../../../../ws/index";
import type { EwsCommandKind, EwsProxyGateway, EwsProxyResponse } from "../../application/ports/ews-proxy-gateway";

/** Adapter sobre `services/ewsProxyService.ts` + `ws/index.ts` (promesas pendientes resueltas por el WSS, push local o por relay). */
export class EwsProxyServiceGateway implements EwsProxyGateway {
  pushCommand(agentId: string, commandId: string, payload: Record<string, unknown>, kind: EwsCommandKind = "EWS_PROXY"): Promise<boolean> {
    return pushEwsProxyCommand(agentId, commandId, payload, kind);
  }

  waitForResult(commandId: string, agentId: string, timeoutMs: number): Promise<EwsProxyResponse> {
    return waitForEwsProxyResult(commandId, agentId, timeoutMs);
  }
}
