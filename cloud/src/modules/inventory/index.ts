import type { Knex } from "knex";
import { ValidateAndMergeCustomDataUseCase } from "./application/use-cases/custom-field-def-use-cases";
import { KnexCustomFieldDefRepository } from "./infrastructure/database/knex-custom-field-def-repository";

export { CustomFieldError } from "./domain/errors/custom-field-error";

/**
 * Facade para consumidores externos (fuera de `modules/inventory`) que
 * necesitan validar/mergear `custom_data` de un dispositivo contra las
 * definiciones vivas del cliente — hoy sólo `deviceController/crud.ts`.
 * Mismo nombre/firma que la función homónima que exportaba el viejo
 * `services/customFieldService.ts`, para que ese call-site no tenga que
 * cambiar nada más que el import.
 */
export async function validateAndMerge(
  db: Knex,
  clientId: string,
  currentData: Record<string, unknown> | null,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const useCase = new ValidateAndMergeCustomDataUseCase(new KnexCustomFieldDefRepository(db));
  return useCase.execute(clientId, currentData, patch);
}
