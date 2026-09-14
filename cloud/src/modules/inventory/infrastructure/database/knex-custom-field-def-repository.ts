import type { Knex } from "knex";
import { CustomFieldError } from "../../domain/errors/custom-field-error";
import type { CustomFieldDef } from "../../domain/entities/custom-field-def";
import type {
  CreateCustomFieldDefInput,
  CustomFieldDefRepository,
  UpdateCustomFieldDefColumns,
} from "../../domain/repositories/custom-field-def-repository";

function toEntity(row: any): CustomFieldDef {
  return {
    id: row.id,
    clientId: row.client_id,
    key: row.key,
    label: row.label,
    type: row.type,
    options: typeof row.options === "string" ? JSON.parse(row.options) : row.options,
    position: row.position,
    createdAt: row.created_at,
  };
}

export class KnexCustomFieldDefRepository implements CustomFieldDefRepository {
  constructor(private readonly db: Knex) {}

  async listVisibleForClient(clientId: string): Promise<CustomFieldDef[]> {
    const rows = await this.db("custom_field_defs")
      .where((q) => q.whereNull("client_id").orWhere("client_id", clientId))
      .whereNull("archived_at")
      .orderBy(["position", "created_at"]);
    return rows.map(toEntity);
  }

  async countLiveInScope(clientId: string | null): Promise<number> {
    const row = await this.db("custom_field_defs")
      .where((q) => (clientId ? q.where("client_id", clientId) : q.whereNull("client_id")))
      .whereNull("archived_at")
      .count("id as c")
      .first();
    return Number(row?.c ?? 0);
  }

  async create(input: CreateCustomFieldDefInput): Promise<CustomFieldDef> {
    try {
      const [row] = await this.db("custom_field_defs")
        .insert({
          client_id: input.clientId,
          key: input.key,
          label: input.label,
          type: input.type,
          options: input.options ? JSON.stringify(input.options) : null,
          position: input.position,
          created_by: input.createdBy,
        })
        .returning("*");
      return toEntity(row);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        throw new CustomFieldError(`Ya existe un campo con key "${input.key}" en este alcance`, 409);
      }
      throw err;
    }
  }

  async findById(id: string, clientId: string): Promise<CustomFieldDef | null> {
    const row = await this.db("custom_field_defs").where({ id, client_id: clientId }).whereNull("archived_at").first();
    return row ? toEntity(row) : null;
  }

  async update(id: string, clientId: string, columns: UpdateCustomFieldDefColumns): Promise<CustomFieldDef | null> {
    const updates: Record<string, unknown> = {};
    if (columns.label !== undefined) updates.label = columns.label;
    if (columns.options !== undefined) updates.options = JSON.stringify(columns.options);
    if (columns.position !== undefined) updates.position = columns.position;

    const [row] = await this.db("custom_field_defs").where({ id, client_id: clientId }).update(updates).returning("*");
    return row ? toEntity(row) : null;
  }

  async archive(id: string, clientId: string): Promise<boolean> {
    const updated = await this.db("custom_field_defs").where({ id, client_id: clientId }).whereNull("archived_at").update({ archived_at: new Date() });
    return updated > 0;
  }
}
