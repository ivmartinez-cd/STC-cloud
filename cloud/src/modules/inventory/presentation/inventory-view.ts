import type { CustomFieldDef } from "../domain/entities/custom-field-def";
import type { DeviceModel } from "../domain/entities/device-model";

// Contrato de wire snake_case preservado tal cual lo consumía ya el portal
// (`types/inventory.ts`: client_id, model_key, duty_cycle_monthly, etc.) —
// el dominio interno usa camelCase, esta es la traducción explícita en el
// borde del sistema.

export function toCustomFieldDefView(def: CustomFieldDef) {
  return {
    id: def.id,
    client_id: def.clientId,
    key: def.key,
    label: def.label,
    type: def.type,
    options: def.options,
    position: def.position,
    created_at: def.createdAt,
  };
}

export function toCustomFieldDefListView(defs: CustomFieldDef[]) {
  return defs.map(toCustomFieldDefView);
}

export function toDeviceModelView(model: DeviceModel) {
  return {
    id: model.id,
    brand: model.brand,
    model_key: model.modelKey,
    display_name: model.displayName,
    duty_cycle_monthly: model.dutyCycleMonthly,
    recommended_volume_monthly: model.recommendedVolumeMonthly,
    is_color: model.isColor,
    notes: model.notes,
  };
}

export function toDeviceModelListView(models: DeviceModel[]) {
  return models.map(toDeviceModelView);
}
