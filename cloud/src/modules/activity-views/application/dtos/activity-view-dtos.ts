import type { ActivitySavedView } from "../../domain/entities/activity-saved-view";

export interface ActivitySavedViewDto {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export function toViewDto(v: ActivitySavedView): ActivitySavedViewDto {
  return { id: v.id, name: v.name, filters: v.filters, created_at: new Date(v.createdAt).toISOString() };
}
