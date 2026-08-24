import type { FeedbackStatus, FeedbackType } from "../../domain/entities/feedback";

// Desacoplado de `PortalUser` (api/middlewares/authMiddleware) a propósito:
// application no depende de presentation. El controller mapea PortalUser -> esto.
export interface RequestingUser {
  userId: string;
  username: string;
  role: string;
}

export interface SubmitFeedbackInput {
  requestingUser: RequestingUser;
  type: FeedbackType;
  title: string;
  description: string;
  imageUrl?: string | null;
  ipAddress: string | null;
}

export interface UpdateFeedbackStatusInput {
  requestingUser: RequestingUser;
  feedbackId: string;
  status: FeedbackStatus;
  ipAddress: string | null;
}
