import type { Knex } from "knex";

/** Cola de comandos remotos (FORCE_SCAN, RESTART, UPDATE_CONFIG, ...) para agentes DCA. */
export class AgentCommandService {
  constructor(private db: Knex) {}

  /**
   * Registra un comando remoto pendiente para un agente DCA.
   * @param agentId - UUID del agente destinatario.
   * @param type - Tipo de comando (FORCE_SCAN, RESTART, UPDATE_CONFIG, etc.).
   * @param payload - Datos adicionales del comando.
   * @param createdBy - ID del usuario del portal que originó el comando.
   */
  async addCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) {
    const [command] = await this.db("agent_commands").insert({
      agent_id: agentId,
      type,
      payload: JSON.stringify(payload),
      status: "pending",
      created_by: createdBy || null,
    }).returning("*");
    return command;
  }

  async getPendingCommands(agentId: string) {
    const commands = await this.db("agent_commands")
      .where({ agent_id: agentId, status: "pending" })
      .select("id", "type", "payload");

    if (commands.length > 0) {
      // Marcar como enviados para que no se repitan
      await this.db("agent_commands")
        .whereIn("id", commands.map(c => c.id))
        .update({ status: "sent", sent_at: new Date() });
    }

    return commands.map(c => ({
      id: c.id,
      type: c.type,
      payload: typeof c.payload === "string" ? JSON.parse(c.payload) : c.payload,
    }));
  }

  /** Actualiza el resultado de un comando ejecutado por el agente. */
  async updateCommandResult(commandId: string, status: string, result: Record<string, unknown> | null) {
    await this.db("agent_commands")
      .where({ id: commandId })
      .update({
        status,
        result: result ? JSON.stringify(result) : null,
        executed_at: new Date()
      });
  }
}
