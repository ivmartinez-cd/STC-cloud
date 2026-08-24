import type { Knex } from "knex";
import { validateAndMerge } from "../../../inventory";
import type { CustomFieldMerger } from "../../application/ports/custom-field-merger";

/** Adapter sobre la fachada de `modules/inventory` (`CustomFieldError` se propaga tal cual). */
export class InventoryCustomFieldMerger implements CustomFieldMerger {
  constructor(private readonly db: Knex) {}

  validateAndMerge(clientId: string, current: unknown, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return validateAndMerge(this.db, clientId, current as Record<string, unknown> | null, patch);
  }
}
