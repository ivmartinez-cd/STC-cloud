import { REPORT_FORMATS, REPORT_TYPES, SCHEDULE_FREQS } from "../domain/entities/scheduled-report";

const bodySchema = {
  type: "object",
  required: ["name", "report_type"],
  additionalProperties: false,
  properties: {
    client_id: { type: ["string", "null"], format: "uuid" },
    name: { type: "string", minLength: 3, maxLength: 120 },
    report_type: { type: "string", enum: [...REPORT_TYPES] },
    params: { type: "object" },
    format: { type: "string", enum: [...REPORT_FORMATS] },
    schedule_freq: { type: "string", enum: [...SCHEDULE_FREQS] },
    schedule_dow: { type: ["integer", "null"], minimum: 0, maximum: 6 },
    schedule_dom: { type: ["integer", "null"], minimum: 1, maximum: 28 },
    schedule_hour: { type: "integer", minimum: 0, maximum: 23 },
    recipients: { type: "array", maxItems: 20, items: { type: "string", maxLength: 255 } },
    enabled: { type: "boolean" },
  },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export const createScheduledReportSchema = { body: bodySchema };
export const updateScheduledReportSchema = { body: bodySchema, params: idParams };
export const idParamSchema = { params: idParams };
