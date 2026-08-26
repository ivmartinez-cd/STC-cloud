import type { Knex } from "knex";
import type { ActivitySavedView } from "../../domain/entities/activity-saved-view";
import type { ActivitySavedViewRepository } from "../../domain/repositories/activity-saved-view-repository";

function toEntity(row: Record<string, unknown>): ActivitySavedView {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    filters: row.filters as Record<string, unknown>,
    createdAt: row.created_at as Date,
  };
}

export class KnexActivitySavedViewRepository implements ActivitySavedViewRepository {
  constructor(private readonly db: Knex) {}

  async listByUser(userId: string): Promise<ActivitySavedView[]> {
    const rows = await this.db("activity_saved_views").where({ user_id: userId }).orderBy("created_at", "desc");
    return rows.map(toEntity);
  }

  async create(userId: string, name: string, filters: Record<string, unknown>): Promise<ActivitySavedView> {
    const [row] = await this.db("activity_saved_views").insert({ user_id: userId, name, filters: JSON.stringify(filters) }).returning("*");
    return toEntity(row);
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db("activity_saved_views").where({ id, user_id: userId }).delete();
    return deleted > 0;
  }
}
