import { NotFoundError, UnauthorizedError } from "../../../../shared/domain/errors";
import type { Feedback } from "../../domain/entities/feedback";
import type { FeedbackRepository } from "../../domain/repositories/feedback-repository";
import type { AuditLogEntry, AuditLogWriter } from "../ports/audit-log-writer";
import type { EffectiveIdentity, IdentityResolver } from "../ports/identity-resolver";
import type { UpdateFeedbackStatusInput } from "../dtos/feedback-dtos";

function toAuditEntry(input: UpdateFeedbackStatusInput, updated: Feedback, author: EffectiveIdentity): AuditLogEntry {
  return {
    userId: author.id,
    action: "UPDATE_FEEDBACK_STATUS",
    targetId: updated.id,
    metadata: { status: input.status, title: updated.title, updated_by: author.username },
    ipAddress: input.ipAddress,
  };
}

export class UpdateFeedbackStatusUseCase {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly identityResolver: IdentityResolver,
    private readonly auditLogWriter: AuditLogWriter
  ) {}

  async execute(input: UpdateFeedbackStatusInput): Promise<Feedback> {
    if (input.requestingUser.role !== "admin") {
      throw new UnauthorizedError("Solo administradores pueden actualizar los reportes");
    }

    const updated = await this.feedbackRepository.updateStatus(input.feedbackId, input.status);
    if (!updated) {
      throw new NotFoundError("Feedback no encontrado");
    }

    const author = await this.identityResolver.resolveEffectiveIdentity(input.requestingUser);
    await this.auditLogWriter.write(toAuditEntry(input, updated, author));
    return updated;
  }
}
