export type FeedbackType = "bug" | "enhancement";
export type FeedbackStatus = "open" | "in_progress" | "closed";

export interface Feedback {
  id: string;
  userId: string;
  type: FeedbackType;
  title: string;
  description: string;
  imageUrl: string | null;
  status: FeedbackStatus;
  createdAt: Date;
}

export interface FeedbackWithAuthor extends Feedback {
  username: string;
}
