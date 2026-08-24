import type { Queue } from "bullmq";
import type { SupplyRequest } from "../../domain/entities/supply-request";
import type { RequestNotifier } from "../../application/ports/request-notifier";

/**
 * Encola en la `notifications-queue` compartida (misma decisión que
 * incidentes en la Fase 11: sin transporte nuevo). `notificationWorker.ts`
 * despacha por `job.name` — los nombres acá tienen que coincidir con las
 * ramas de ese worker.
 */
export class BullRequestNotifier implements RequestNotifier {
  constructor(private readonly queue: Queue) {}

  async created(request: SupplyRequest): Promise<void> {
    await this.queue.add("supply_request.created", { requestId: request.id });
  }

  async completed(request: SupplyRequest): Promise<void> {
    await this.queue.add("supply_request.completed", { requestId: request.id });
  }
}
