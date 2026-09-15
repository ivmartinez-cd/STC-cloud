import { REQUEST_STATUSES } from "../domain/entities/supply-request";

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export const listQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      client_id: { type: "string", format: "uuid" },
      device_id: { type: "string", format: "uuid" },
      status: { type: "string", enum: [...REQUEST_STATUSES] },
      origin: { type: "string", enum: ["auto", "manual"] },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    },
  },
};

export const statsQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: { client_id: { type: "string", format: "uuid" } },
  },
};

export const createRequestSchema = {
  body: {
    type: "object",
    required: ["client_id", "supply_kind"],
    additionalProperties: false,
    properties: {
      client_id: { type: "string", format: "uuid" },
      device_id: { type: "string", format: "uuid" },
      supply_kind: { type: "string", minLength: 2, maxLength: 30 },
      // Clave real del consumible (`toner-black`, `mt-fuser`…), la manda el
      // modal "Detalles del consumible" para que el pedido quede enganchado
      // al mismo insumo que muestra el historial. Sin ella se cae al
      // `manual:<kind>:<color>` de siempre.
      supply_key: { type: "string", minLength: 1, maxLength: 120 },
      external_ref: { type: ["string", "null"], maxLength: 120 },
      supply_color: { type: ["string", "null"], maxLength: 20 },
      description: { type: ["string", "null"], maxLength: 200 },
      sku: { type: ["string", "null"], maxLength: 100 },
      notes: { type: ["string", "null"], maxLength: 2000 },
    },
  },
};

export const statusChangeSchema = {
  params: idParams,
  body: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: [...REQUEST_STATUSES] },
      note: { type: ["string", "null"], maxLength: 2000 },
    },
  },
};

export const commentSchema = {
  params: idParams,
  body: {
    type: "object",
    required: ["body"],
    additionalProperties: false,
    properties: { body: { type: "string", minLength: 1, maxLength: 2000 } },
  },
};

export const idParamSchema = { params: idParams };

export const settingsBodySchema = {
  body: {
    type: "object",
    required: ["enabled", "threshold_pct"],
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      threshold_pct: { type: "integer", minimum: 1, maximum: 99 },
    },
  },
};
