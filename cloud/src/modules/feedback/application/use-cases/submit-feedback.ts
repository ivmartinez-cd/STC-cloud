import type { Feedback } from "../../domain/entities/feedback";
import type { CreateFeedbackInput, FeedbackRepository } from "../../domain/repositories/feedback-repository";
import type { AuditLogEntry, AuditLogWriter } from "../ports/audit-log-writer";
import type { EffectiveIdentity, IdentityResolver } from "../ports/identity-resolver";
import type { SubmitFeedbackInput } from "../dtos/feedback-dtos";

function toCreateInput(input: SubmitFeedbackInput, author: EffectiveIdentity): CreateFeedbackInput {
  return {
    userId: author.id,
    type: input.type,
    title: input.title.trim(),
    description: input.description.trim(),
    imageUrl: input.imageUrl?.trim() || null,
  };
}

function toAuditEntry(input: SubmitFeedbackInput, feedback: Feedback, author: EffectiveIdentity): AuditLogEntry {
  return {
    userId: author.id,
    action: input.type === "bug" ? "REPORT_BUG" : "SUGGEST_ENHANCEMENT",
    targetId: feedback.id,
    metadata: { title: input.title, type: input.type, submitted_by: author.username },
    ipAddress: input.ipAddress,
  };
}

export class SubmitFeedbackUseCase {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly identityResolver: IdentityResolver,
    private readonly auditLogWriter: AuditLogWriter
  ) {}

  async execute(input: SubmitFeedbackInput): Promise<Feedback> {
    const author = await this.identityResolver.resolveEffectiveIdentity(input.requestingUser);
    const feedback = await this.feedbackRepository.create(toCreateInput(input, author));
    await this.auditLogWriter.write(toAuditEntry(input, feedback, author));
    return feedback;
  }
}
