import type { Feedback, FeedbackStatus, FeedbackType, FeedbackWithAuthor } from "../entities/feedback";

export interface CreateFeedbackInput {
  userId: string;
  type: FeedbackType;
  title: string;
  description: string;
  imageUrl: string | null;
}

export interface FeedbackRepository {
  create(input: CreateFeedbackInput): Promise<Feedback>;
  listWithAuthor(): Promise<FeedbackWithAuthor[]>;
  updateStatus(id: string, status: FeedbackStatus): Promise<Feedback | null>;
}
