import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { CustomFieldError } from "../domain/errors/custom-field-error";
import type {
  ArchiveCustomFieldDefUseCase,
  CreateCustomFieldDefUseCase,
  ListCustomFieldDefsUseCase,
  UpdateCustomFieldDefUseCase,
} from "../application/use-cases/custom-field-def-use-cases";
import type {
  CreateDeviceModelUseCase,
  ListDeviceModelsUseCase,
  UpdateDeviceModelUseCase,
} from "../application/use-cases/device-model-use-cases";
import { toCustomFieldDefListView, toCustomFieldDefView, toDeviceModelListView, toDeviceModelView } from "./inventory-view";

interface InventoryUseCases {
  listCustomFields: ListCustomFieldDefsUseCase;
  createCustomField: CreateCustomFieldDefUseCase;
  updateCustomField: UpdateCustomFieldDefUseCase;
  archiveCustomField: ArchiveCustomFieldDefUseCase;
  listDeviceModels: ListDeviceModelsUseCase;
  createDeviceModel: CreateDeviceModelUseCase;
  updateDeviceModel: UpdateDeviceModelUseCase;
}

function currentUser(request: FastifyRequest): PortalUser | undefined {
  return (request as FastifyRequest & { user?: PortalUser }).user;
}

function handleCustomFieldError(err: unknown, reply: FastifyReply) {
  if (err instanceof CustomFieldError) {
    return reply.status(err.statusCode).send({ error: err.message });
  }
  throw err;
}

function buildListCustomFieldsHandler(useCase: ListCustomFieldDefsUseCase) {
  return async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    return toCustomFieldDefListView(await useCase.execute(id));
  };
}

function buildCreateCustomFieldHandler(useCase: CreateCustomFieldDefUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { key, label, type, options, position } = request.body as {
      key?: string; label?: string; type?: string; options?: unknown; position?: number;
    };
    if (!key || !label || !type) return reply.status(400).send({ error: "key, label y type son requeridos" });
    try {
      const created = await useCase.execute({
        clientId: id, key, label, type, options, position, createdBy: currentUser(request)?.userId ?? null,
      });
      return reply.status(201).send(toCustomFieldDefView(created));
    } catch (err) {
      return handleCustomFieldError(err, reply);
    }
  };
}

function buildUpdateCustomFieldHandler(useCase: UpdateCustomFieldDefUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { fieldId } = request.params as { id: string; fieldId: string };
    const { label, options, position } = request.body as { label?: string; options?: unknown; position?: number };
    try {
      const updated = await useCase.execute(fieldId, { label, options, position });
      if (!updated) return reply.status(404).send({ error: "Campo personalizado no encontrado" });
      return toCustomFieldDefView(updated);
    } catch (err) {
      return handleCustomFieldError(err, reply);
    }
  };
}

function buildArchiveCustomFieldHandler(useCase: ArchiveCustomFieldDefUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { fieldId } = request.params as { id: string; fieldId: string };
    const archived = await useCase.execute(fieldId);
    if (!archived) return reply.status(404).send({ error: "Campo personalizado no encontrado" });
    return { archived: true };
  };
}

function buildListDeviceModelsHandler(useCase: ListDeviceModelsUseCase) {
  return async (request: FastifyRequest) => {
    const { brand, q } = request.query as { brand?: string; q?: string };
    return toDeviceModelListView(await useCase.execute({ brand, q }));
  };
}

function buildCreateDeviceModelHandler(useCase: CreateDeviceModelUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { brand, model_key, display_name, duty_cycle_monthly, recommended_volume_monthly, is_color, notes } =
      request.body as {
        brand?: string; model_key?: string; display_name?: string; duty_cycle_monthly?: number;
        recommended_volume_monthly?: number; is_color?: boolean; notes?: string;
      };
    try {
      const created = await useCase.execute({
        brand: brand ?? "", modelKey: model_key ?? "", displayName: display_name,
        dutyCycleMonthly: duty_cycle_monthly, recommendedVolumeMonthly: recommended_volume_monthly,
        isColor: is_color, notes,
      });
      return reply.status(201).send(toDeviceModelView(created));
    } catch (err) {
      return handleCustomFieldError(err, reply);
    }
  };
}

function buildUpdateDeviceModelHandler(useCase: UpdateDeviceModelUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { duty_cycle_monthly, recommended_volume_monthly, is_color, notes, display_name } = request.body as {
      duty_cycle_monthly?: number | null; recommended_volume_monthly?: number | null; is_color?: boolean | null;
      notes?: string | null; display_name?: string | null;
    };
    const updated = await useCase.execute(id, {
      dutyCycleMonthly: duty_cycle_monthly, recommendedVolumeMonthly: recommended_volume_monthly,
      isColor: is_color, notes, displayName: display_name,
    });
    if (!updated) return reply.status(404).send({ error: "Modelo no encontrado" });
    return toDeviceModelView(updated);
  };
}

export function createInventoryController(useCases: InventoryUseCases) {
  return {
    listCustomFields: buildListCustomFieldsHandler(useCases.listCustomFields),
    createCustomField: buildCreateCustomFieldHandler(useCases.createCustomField),
    updateCustomField: buildUpdateCustomFieldHandler(useCases.updateCustomField),
    archiveCustomField: buildArchiveCustomFieldHandler(useCases.archiveCustomField),
    listDeviceModels: buildListDeviceModelsHandler(useCases.listDeviceModels),
    createDeviceModel: buildCreateDeviceModelHandler(useCases.createDeviceModel),
    updateDeviceModel: buildUpdateDeviceModelHandler(useCases.updateDeviceModel),
  };
}
