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
  /**
   * Siempre acotado al cliente de la URL: sin eso, `/clients/A/custom-fields/:fieldId`
   * editaba o archivaba un campo del cliente B —o uno global— con sólo conocer
   * el id (auditoría 14/09/2026). Los globales (`client_id` null) no se tocan
   * desde la ficha de un cliente.
   */
  findById(id: string, clientId: string): Promise<CustomFieldDef | null>;
  update(id: string, clientId: string, columns: UpdateCustomFieldDefColumns): Promise<CustomFieldDef | null>;
  /** Archivar (no DELETE): los valores ya guardados en `devices.custom_data` sobreviven, sólo quedan huérfanos e invisibles para el portal. */
  archive(id: string, clientId: string): Promise<boolean>;
}
