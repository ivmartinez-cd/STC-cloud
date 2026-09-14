import type { CustomFieldDef, CustomFieldType } from "../../domain/entities/custom-field-def";
import { CustomFieldError } from "../../domain/errors/custom-field-error";
import type {
  CustomFieldDefRepository,
  UpdateCustomFieldDefColumns,
} from "../../domain/repositories/custom-field-def-repository";
import {
  MAX_LIVE_FIELDS_PER_SCOPE,
  mergeCustomFieldData,
  normalizeAndValidateKey,
  validateCreateOptions,
  validateLabel,
  validateType,
} from "../../domain/services/custom-field-rules";
import type { CreateCustomFieldDefRequest, UpdateCustomFieldDefRequest } from "../dtos/inventory-dtos";

export class ListCustomFieldDefsUseCase {
  constructor(private readonly repo: CustomFieldDefRepository) {}
  execute(clientId: string): Promise<CustomFieldDef[]> {
    return this.repo.listVisibleForClient(clientId);
  }
}

export class CreateCustomFieldDefUseCase {
  constructor(private readonly repo: CustomFieldDefRepository) {}

  async execute(request: CreateCustomFieldDefRequest): Promise<CustomFieldDef> {
    const key = normalizeAndValidateKey(request.key);
    validateType(request.type);
    const label = validateLabel(request.label);
    const options = validateCreateOptions(request.type as CustomFieldType, request.options);

    const count = await this.repo.countLiveInScope(request.clientId);
    if (count >= MAX_LIVE_FIELDS_PER_SCOPE) {
      throw new CustomFieldError(`Máximo ${MAX_LIVE_FIELDS_PER_SCOPE} campos personalizados por cliente`);
    }

    return this.repo.create({
      clientId: request.clientId,
      key,
      label,
      type: request.type as CustomFieldType,
      options,
      position: request.position ?? 0,
      createdBy: request.createdBy,
    });
  }
}

export class UpdateCustomFieldDefUseCase {
  constructor(private readonly repo: CustomFieldDefRepository) {}

  async execute(id: string, clientId: string, request: UpdateCustomFieldDefRequest): Promise<CustomFieldDef | null> {
    const existing = await this.repo.findById(id, clientId);
    if (!existing) return null;

    const columns: UpdateCustomFieldDefColumns = {};
    if (request.label !== undefined) columns.label = validateLabel(request.label);
    if (request.options !== undefined) {
      if (existing.type !== "select") throw new CustomFieldError("options sólo aplica a campos type 'select'");
      if (!Array.isArray(request.options) || request.options.length === 0) {
        throw new CustomFieldError("options debe ser un string[] no vacío");
      }
      columns.options = (request.options as unknown[]).map((o) => String(o).trim()).filter(Boolean);
    }
    if (request.position !== undefined) columns.position = request.position;

    if (Object.keys(columns).length === 0) return existing;
    return this.repo.update(id, clientId, columns);
  }
}

export class ArchiveCustomFieldDefUseCase {
  constructor(private readonly repo: CustomFieldDefRepository) {}
  execute(id: string, clientId: string): Promise<boolean> {
    return this.repo.archive(id, clientId);
  }
}

export class ValidateAndMergeCustomDataUseCase {
  constructor(private readonly repo: CustomFieldDefRepository) {}

  async execute(
    clientId: string,
    currentData: Record<string, unknown> | null,
    patch: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const defs = await this.repo.listVisibleForClient(clientId);
    return mergeCustomFieldData(defs, currentData, patch);
  }
}
