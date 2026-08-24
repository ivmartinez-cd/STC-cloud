/**
 * Validación + merge de `custom_data` contra las definiciones de campos del
 * cliente — lógica de negocio del módulo `inventory` (su fachada
 * `validateAndMerge`), consumida acá por puerto. Lanza `CustomFieldError`
 * (con `statusCode`) ante un valor inválido; el controller la traduce.
 */
export interface CustomFieldMerger {
  validateAndMerge(clientId: string, current: unknown, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}
