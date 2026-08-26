import type { ActivitySavedView } from "../entities/activity-saved-view";

export interface ActivitySavedViewRepository {
  listByUser(userId: string): Promise<ActivitySavedView[]>;
  create(userId: string, name: string, filters: Record<string, unknown>): Promise<ActivitySavedView>;
  /** Sólo borra si `id` pertenece a `userId` — devuelve `false` si no existía o era de otro usuario. */
  remove(id: string, userId: string): Promise<boolean>;
}
