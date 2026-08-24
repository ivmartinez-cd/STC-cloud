import { UnauthorizedError } from "../../../../shared/domain/errors";
import type { FeedbackWithAuthor } from "../../domain/entities/feedback";
import type { FeedbackRepository } from "../../domain/repositories/feedback-repository";
import type { RequestingUser } from "../dtos/feedback-dtos";

export class ListFeedbackUseCase {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  async execute(requestingUser: RequestingUser): Promise<FeedbackWithAuthor[]> {
    if (requestingUser.role !== "admin") {
      throw new UnauthorizedError("Solo administradores pueden ver los reportes");
    }
    return this.feedbackRepository.listWithAuthor();
  }
}
