import { CustomFieldError } from "../errors/custom-field-error";
import type { CustomFieldDef, CustomFieldType } from "../entities/custom-field-def";

export const VALID_TYPES: ReadonlySet<CustomFieldType> = new Set(["text", "number", "date", "select", "boolean"]);
export const KEY_RX = /^[a-z][a-z0-9_]{0,63}$/;
// Tope duro para que la tabla del portal (una columna por campo) no se vuelva
// inusable — no es un límite técnico de la base, es de UX.
export const MAX_LIVE_FIELDS_PER_SCOPE = 25;

export function normalizeAndValidateKey(rawKey: string): string {
  const key = rawKey.trim().toLowerCase();
  if (!KEY_RX.test(key)) {
    throw new CustomFieldError("key inválida: sólo minúsculas, números y _, debe empezar con letra, máx 64 caracteres");
  }
  return key;
}

export function validateType(type: string): asserts type is CustomFieldType {
  if (!VALID_TYPES.has(type as CustomFieldType)) {
    throw new CustomFieldError(`type inválido: debe ser uno de ${[...VALID_TYPES].join(", ")}`);
  }
}

export function validateLabel(rawLabel: string): string {
  const label = rawLabel.trim();
  if (!label) throw new CustomFieldError("label es requerido");
  return label;
}

export function validateCreateOptions(type: CustomFieldType, rawOptions: unknown): string[] | null {
  if (type !== "select") return null;
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    throw new CustomFieldError("type 'select' requiere options: string[] no vacío");
  }
  return rawOptions.map((o) => String(o).trim()).filter(Boolean);
}

/**
 * Valida un patch de `custom_data` contra las definiciones vivas del scope del
 * dispositivo y lo mergea (parcial, por clave) sobre el jsonb actual — nunca
 * reemplaza el objeto entero, así un campo no incluido en el patch no se pierde.
 */
export function mergeCustomFieldData(
  defs: CustomFieldDef[],
  currentData: Record<string, unknown> | null,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const merged: Record<string, unknown> = { ...(currentData ?? {}) };

  for (const [key, rawValue] of Object.entries(patch)) {
    const def = byKey.get(key);
    if (!def) throw new CustomFieldError(`Campo personalizado desconocido: "${key}"`);

    if (rawValue === null) {
      merged[key] = null;
      continue;
    }
    merged[key] = coerceValue(def, key, rawValue);
  }
  return merged;
}

function coerceValue(def: CustomFieldDef, key: string, rawValue: unknown): unknown {
  switch (def.type) {
    case "text":
      return String(rawValue).slice(0, 500);
    case "number": {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) throw new CustomFieldError(`"${key}" debe ser numérico`);
      return n;
    }
    case "date": {
      const d = new Date(rawValue as string);
      if (Number.isNaN(d.getTime())) throw new CustomFieldError(`"${key}" debe ser una fecha válida`);
      return d.toISOString().slice(0, 10);
    }
    case "boolean":
      return Boolean(rawValue);
    case "select": {
      const options = def.options ?? [];
      if (!options.includes(String(rawValue))) {
        throw new CustomFieldError(`"${key}": valor fuera de las opciones definidas (${options.join(", ")})`);
      }
      return String(rawValue);
    }
  }
}
