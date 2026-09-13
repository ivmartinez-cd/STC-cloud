/**
 * Resolvers en memoria para hacer que el flujo de comandos WS existente
 * (fire-and-forget + polling, ver `agentService.addCommand`/`getPendingCommands`)
 * se sienta SÍNCRONO para el proxy EWS remoto: la request HTTP del portal
 * queda esperando una promesa hasta que `ws/index.ts` reciba el
 * `command_result` correspondiente, o hasta el timeout.
 *
 * Deliberadamente NO pasa por `broadcastToPortal` (que hoy manda cualquier
 * `command_result` a TODOS los portales admin/operator conectados,
 * `ws/index.ts:50-59`) — el contenido de la EWS de un cliente sólo debe
 * llegar a quien lo pidió, nunca a un tercer admin conectado en simultáneo.
 *
 * Idempotente por diseño: `resolve`/`reject`/el timeout compiten por borrar
 * la misma entrada del mapa; sólo el primero en llegar hace efecto, evitando
 * doble-resolve si el agente responde justo cuando ya venció el timeout.
 */

export interface EwsProxyResult {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  truncated: boolean;
  /**
   * Sólo los manda `EWS_REQUEST` (el gateway navegable), no `EWS_PROXY`:
   * - `setCookie`: los `Set-Cookie` crudos del equipo. Van aparte de `headers`
   *   porque NO se le reenvían al navegador — los guarda la sesión del gateway.
   * - `protocol`: con cuál de los dos (http/https) contestó el equipo, para
   *   fijarlo en la sesión y no volver a sondear en cada recurso de la página.
   */
  setCookie?: string[];
  protocol?: "http" | "https";
}

interface PendingEntry {
  agentId: string;
  settle: (result: { ok: true; value: EwsProxyResult } | { ok: false; error: string }) => void;
}

const pending = new Map<string, PendingEntry>();

export function waitForEwsProxyResult(
  commandId: string,
  agentId: string,
  timeoutMs: number
): Promise<EwsProxyResult> {
  return new Promise((resolve, reject) => {
    const settle = (outcome: { ok: true; value: EwsProxyResult } | { ok: false; error: string }) => {
      if (!pending.delete(commandId)) return; // ya resuelto (timeout ganó la carrera, o doble mensaje)
      clearTimeout(timeoutHandle);
      if (outcome.ok) resolve(outcome.value);
      else reject(new Error(outcome.error));
    };

    const timeoutHandle = setTimeout(() => {
      settle({ ok: false, error: 'Timeout esperando respuesta del agente' });
    }, timeoutMs);

    pending.set(commandId, { agentId, settle });
  });
}

/** Llamado por `ws/index.ts` al recibir un `command_result` de tipo EWS_PROXY. */
export function resolveEwsProxy(commandId: string, result: EwsProxyResult): void {
  pending.get(commandId)?.settle({ ok: true, value: result });
}

export function rejectEwsProxy(commandId: string, error: string): void {
  pending.get(commandId)?.settle({ ok: false, error });
}

/** Llamado al desconectarse el socket de un agente — nunca dejar una request del portal colgada hasta el timeout si ya sabemos que el agente se cayó. */
export function rejectAllPendingForAgent(agentId: string): void {
  for (const [commandId, entry] of pending) {
    if (entry.agentId === agentId) {
      entry.settle({ ok: false, error: 'El agente se desconectó mientras se esperaba la respuesta' });
    }
  }
}

/** Sólo para tests. */
export function _pendingCountForTests(): number {
  return pending.size;
}
