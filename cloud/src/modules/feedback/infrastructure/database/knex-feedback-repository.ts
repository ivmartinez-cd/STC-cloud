import type { Knex } from "knex";
import type { Feedback, FeedbackStatus, FeedbackWithAuthor } from "../../domain/entities/feedback";
import type { CreateFeedbackInput, FeedbackRepository } from "../../domain/repositories/feedback-repository";

interface FeedbackRow {
  id: string;
  user_id: string;
  type: Feedback["type"];
  title: string;
  description: string;
  image_url: string | null;
  status: FeedbackStatus;
  created_at: Date;
}

const FEEDBACK_COLUMNS = ["id", "user_id", "type", "title", "description", "image_url", "status", "created_at"];

function toDomain(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class KnexFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const [row] = await this.db("user_feedback")
      .insert({
        id: this.db.raw("gen_random_uuid()"),
        user_id: input.userId,
        type: input.type,
        title: input.title,
        description: input.description,
        image_url: input.imageUrl,
        status: "open",
      })
      .returning(FEEDBACK_COLUMNS);
    return toDomain(row);
  }

  async listWithAuthor(): Promise<FeedbackWithAuthor[]> {
    const rows = await this.db("user_feedback as f")
      .join("users as u", "f.user_id", "u.id")
      .select(
        "f.id",
        "f.user_id",
        "f.type",
        "f.title",
        "f.description",
        "f.image_url",
        "f.status",
        "f.created_at",
        "u.username"
      )
      .orderBy("f.created_at", "desc");
    return rows.map((row: FeedbackRow & { username: string }) => ({ ...toDomain(row), username: row.username }));
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<Feedback | null> {
    const [row] = await this.db("user_feedback")
      .where({ id })
      .update({ status, updated_at: this.db.fn.now() })
      .returning(FEEDBACK_COLUMNS);
    return row ? toDomain(row) : null;
  }
}
