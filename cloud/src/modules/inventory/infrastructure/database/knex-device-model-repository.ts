import type { Knex } from "knex";
import { CustomFieldError } from "../../domain/errors/custom-field-error";
import type { DeviceModel } from "../../domain/entities/device-model";
import type {
  CreateDeviceModelInput,
  DeviceModelRepository,
  ListDeviceModelsFilter,
  UpdateDeviceModelColumns,
} from "../../domain/repositories/device-model-repository";

function toEntity(row: any): DeviceModel {
  return {
    id: row.id,
    brand: row.brand,
    modelKey: row.model_key,
    displayName: row.display_name,
    dutyCycleMonthly: row.duty_cycle_monthly,
    recommendedVolumeMonthly: row.recommended_volume_monthly,
    isColor: row.is_color,
    notes: row.notes,
  };
}

export class KnexDeviceModelRepository implements DeviceModelRepository {
  constructor(private readonly db: Knex) {}

  async list(filter: ListDeviceModelsFilter): Promise<DeviceModel[]> {
    const rows = await this.db("device_models")
      .modify((query) => {
        if (filter.brand) query.andWhereRaw("lower(brand) = lower(?)", [filter.brand]);
        if (filter.q) query.andWhere((b) => {
          b.whereRaw("model_key ILIKE ?", [`%${filter.q}%`]).orWhereRaw("display_name ILIKE ?", [`%${filter.q}%`]);
        });
      })
      .orderBy(["brand", "model_key"]);
    return rows.map(toEntity);
  }

  async create(input: CreateDeviceModelInput): Promise<DeviceModel> {
    try {
      const [row] = await this.db("device_models")
        .insert({
          brand: input.brand,
          model_key: input.modelKey,
          display_name: input.displayName,
          duty_cycle_monthly: input.dutyCycleMonthly,
          recommended_volume_monthly: input.recommendedVolumeMonthly,
          is_color: input.isColor,
          notes: input.notes,
        })
        .returning("*");
      return toEntity(row);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        throw new CustomFieldError(`Ya existe un modelo ${input.brand}/${input.modelKey}`, 409);
      }
      throw err;
    }
  }

  async update(id: string, columns: UpdateDeviceModelColumns): Promise<DeviceModel | null> {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (columns.dutyCycleMonthly !== undefined) updates.duty_cycle_monthly = columns.dutyCycleMonthly;
    if (columns.recommendedVolumeMonthly !== undefined) updates.recommended_volume_monthly = columns.recommendedVolumeMonthly;
    if (columns.isColor !== undefined) updates.is_color = columns.isColor;
    if (columns.notes !== undefined) updates.notes = columns.notes;
    if (columns.displayName !== undefined) updates.display_name = columns.displayName;

    const [row] = await this.db("device_models").where({ id }).update(updates).returning("*");
    return row ? toEntity(row) : null;
  }
}
