import type { AlertLifecycleState } from "../../domain/entities/alert";
import { AlertNotFoundError, AlertUpdateError } from "../../domain/errors/alert-error";
import type { AlertRepository } from "../../domain/repositories/alert-repository";
import { buildLifecycleUpdates, hasLifecycleUpdates, lifecycleAuditAction } from "../../domain/services/alert-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { UpdateAlertInput } from "../dtos/alert-dtos";

/**
 * `PUT /alerts/:id` — reconocer y/o resolver una alerta. El orden de los
 * chequeos se preserva del controller original (404 por no-existencia/
 * propiedad ANTES del 400 por body vacío): cambiarlo sería un cambio de
 * comportamiento observable. El chequeo de propiedad por scope es defensa en
 * profundidad — client_viewer ya recibe 403 por RBAC antes de llegar acá.
 */
export class UpdateAlertUseCase {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly audit: AuditLogWriter
  ) {}

  async execute(input: UpdateAlertInput): Promise<AlertLifecycleState> {
    const id = Number(input.id);
    const owned = await this.alerts.findOwnedIds(input.scope, [id]);
    if (owned.length === 0) throw new AlertNotFoundError();

    const updates = buildLifecycleUpdates(input.userId, input.acknowledged, input.resolved);
    if (!hasLifecycleUpdates(updates)) {
      throw new AlertUpdateError("Nada para actualizar: se espera acknowledged y/o resolved");
    }

    const updated = await this.alerts.updateOne(id, updates);
    await this.audit.write({
      action: lifecycleAuditAction(input.acknowledged, input.resolved),
      targetId: String(input.id),
      userId: input.userId,
      ipAddress: input.ipAddress,
      metadata: { acknowledged: input.acknowledged, resolved: input.resolved },
    });
    return updated;
  }
}
