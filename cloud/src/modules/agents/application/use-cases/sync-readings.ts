import { DEFAULT_BUSINESS_HOURS } from "../../../../services/businessHours";
import { logger } from "../../../../logger";
import type { IncomingReading, InsertedReadingRow, MappedReading } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { IngestDeviceRepository } from "../../domain/repositories/ingest-device-repository";
import { groupReadingsByIdentity, mapWithConcurrency } from "../../domain/services/concurrency";
import type { IngestQueues } from "../ports/ingest-queues";
import type { SyncReadingsResult } from "../dtos/agent-dtos";
import type { HeartbeatUseCase } from "./heartbeat";
import type { ProcessReadingUseCase } from "./process-reading";

// Auditoría de capacidad (200+ clientes): el loop era secuencial y mantenía
// una conexión del pool ocupada todo el lote; se paraleliza con techo de
// concurrencia — `ProcessReadingUseCase` no cambia nada por dispositivo.
const READING_CONCURRENCY = 5;

interface InsertOutcome {
  inserted: InsertedReadingRow[];
  /** Lecturas con device_id existente (las que se intentaron insertar). */
  attempted: number;
}

/**
 * Sincroniza lecturas de telemetría del agente (`POST /devices/sync`). Mismo
 * orden que el `syncReadings` original: touch del agente → contexto del
 * cliente → procesar por grupos de identidad cruda → insertar (idempotente)
 * → encolar alertas y webhook → heartbeat. Sin estado de instancia: el caso
 * de uso es un singleton por proceso y los syncs corren en paralelo.
 */
export class SyncReadingsUseCase {
  constructor(
    private readonly agents: AgentRepository,
    private readonly devices: IngestDeviceRepository,
    private readonly processReading: ProcessReadingUseCase,
    private readonly queues: IngestQueues,
    private readonly heartbeat: HeartbeatUseCase,
    private readonly recordFailure: (agentId: string, message: string, timezone: string) => Promise<void>
  ) {}

  async execute(readings: IncomingReading[], agentId: string, timezone: string = DEFAULT_BUSINESS_HOURS.timezone): Promise<SyncReadingsResult> {
    if (!readings || readings.length === 0) return { received: 0, inserted: 0, duplicates: 0 };
    await this.agents.touchOnSync(agentId);
    const { clientId, approvalRequired } = await this.agents.clientContext(agentId);
    const ctx = { agentId, clientId, approvalRequired, timezone };

    const mapped = await this.processGroups(ctx, readings);
    const { inserted, attempted } = await this.insertMapped(agentId, timezone, mapped);
    await this.queues.enqueueAlertEvaluation(mapped);
    await this.queues.enqueueReadingWebhook(inserted);
    await this.heartbeat.execute(agentId);
    return { received: readings.length, inserted: inserted.length, duplicates: attempted - inserted.length };
  }

  /** Cada grupo (misma identidad cruda) en orden estricto; grupos distintos con techo de concurrencia. */
  private async processGroups(ctx: { agentId: string; clientId: string | null; approvalRequired: boolean; timezone: string }, readings: IncomingReading[]) {
    const groups = Array.from(groupReadingsByIdentity(readings).values());
    const results = await mapWithConcurrency(groups, READING_CONCURRENCY, async (group) => {
      const out: MappedReading[] = [];
      for (const r of group) {
        const m = await this.processReading.execute(ctx, r);
        if (m) out.push(m);
      }
      return out;
    });
    return results.flat();
  }

  /** Filtra lecturas cuyo device_id exista y las inserta con `ON CONFLICT (reading_id, time) DO NOTHING`. */
  private async insertMapped(agentId: string, timezone: string, mapped: MappedReading[]): Promise<InsertOutcome> {
    if (mapped.length === 0) return { inserted: [], attempted: 0 };
    try {
      const validIds = await this.devices.existingIds([...new Set(mapped.map((m) => m.device_id))]);
      const valid = mapped.filter((m) => validIds.has(String(m.device_id)));
      if (valid.length === 0) return { inserted: [], attempted: 0 };
      return { inserted: await this.devices.insertReadings(valid), attempted: valid.length };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errMsg }, "[SYNC] Error al insertar lecturas");
      await this.recordFailure(agentId, `Readings Insert Error: ${errMsg}`, timezone);
      throw err;
    }
  }
}
