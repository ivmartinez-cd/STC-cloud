import type { ActivitySavedView } from "../../domain/entities/activity-saved-view";
import type { ActivitySavedViewRepository } from "../../domain/repositories/activity-saved-view-repository";
import { ValidationError } from "../../../../shared/domain/errors";

export class ActivityViewValidationError extends ValidationError {}

const MAX_NAME_LEN = 80;
const MAX_VIEWS_PER_USER = 30;

function validatedName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) throw new ActivityViewValidationError("El nombre de la vista es requerido");
  if (trimmed.length > MAX_NAME_LEN) throw new ActivityViewValidationError(`Máximo ${MAX_NAME_LEN} caracteres`);
  return trimmed;
}

function validatedFilters(filters: unknown): Record<string, unknown> {
  if (typeof filters !== "object" || filters === null || Array.isArray(filters)) {
    throw new ActivityViewValidationError("filters debe ser un objeto");
  }
  return filters as Record<string, unknown>;
}

export async function saveActivityView(
  repo: ActivitySavedViewRepository,
  userId: string,
  input: { name: unknown; filters: unknown }
): Promise<ActivitySavedView> {
  const name = validatedName(input.name);
  const filters = validatedFilters(input.filters);
  const existing = await repo.listByUser(userId);
  if (existing.length >= MAX_VIEWS_PER_USER) {
    throw new ActivityViewValidationError(`Máximo ${MAX_VIEWS_PER_USER} vistas guardadas`);
  }
  return repo.create(userId, name, filters);
}

export function listActivityViews(repo: ActivitySavedViewRepository, userId: string): Promise<ActivitySavedView[]> {
  return repo.listByUser(userId);
}

export function deleteActivityView(repo: ActivitySavedViewRepository, id: string, userId: string): Promise<boolean> {
  return repo.remove(id, userId);
}
