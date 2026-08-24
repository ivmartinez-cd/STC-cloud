import type { CustomFieldDef, CustomFieldType } from "../entities/custom-field-def";

export interface CreateCustomFieldDefInput {
  clientId: string | null;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  position: number;
  createdBy: string | null;
}

export interface UpdateCustomFieldDefColumns {
  label?: string;
  options?: string[];
  position?: number;
}

export interface CustomFieldDefRepository {
  /** Definiciones vivas visibles para un cliente: las globales (clientId null) + las propias. */
  listVisibleForClient(clientId: string): Promise<CustomFieldDef[]>;
  countLiveInScope(clientId: string | null): Promise<number>;
  /** Lanza CustomFieldError(409) si ya existe una key en ese alcance (constraint única). */
  create(input: CreateCustomFieldDefInput): Promise<CustomFieldDef>;
  findById(id: string): Promise<CustomFieldDef | null>;
  update(id: string, columns: UpdateCustomFieldDefColumns): Promise<CustomFieldDef>;
  /** Archivar (no DELETE): los valores ya guardados en `devices.custom_data` sobreviven, sólo quedan huérfanos e invisibles para el portal. */
  archive(id: string): Promise<boolean>;
}
