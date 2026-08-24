import { Knex } from "knex";

/**
 * Traduce el `type` crudo de una alerta (código de vendor sin traducir) a un
 * motivo legible en español + una clase estilo HP SDS Manager + quién debe
 * actuar. Antes de esto, `alerts.type`/`alerts.message` llegaban tal cual desde
 * tres fuentes sin ningún diccionario intermedio (ver
 * `alertService.synthesizeEwsAlertType`):
 *
 *   1. `prtAlertCode` (RFC 3805, Printer-MIB `1.3.6.1.2.1.43.18.1.1.7`) — un
 *      entero de la tabla `PrtAlertCodeTC`, guardado como string sin traducir
 *      (`agent/src/capture/families/generic-printer-mib.ts`, `snmpAlerts()`).
 *   2. Bits de `hrPrinterDetectedErrorState` (Host Resources MIB) — sintetizados
 *      como `HR-<bit>` con un label en inglés ya armado del lado agente
 *      (`ERROR_BITS`, `generic-printer-mib.ts:275-280`); acá se espeja SOLO la
 *      clasificación (el label en sí ya viaja legible en `alerts.message`).
 *   3. Códigos Samsung de EWS (`activealert.json`, `agent/src/snmp/ews-parsers/
 *      samsung.ts`) — formato `<Familia><Nº>-<Nº>` (`C2-1411`, `S2-3313`,
 *      `M1-5612`), clasificados por familia (C=consumible, S=sistema, M=soporte/
 *      papel) salvo los códigos puntuales ya vistos en la base, que tienen
 *      override exacto.
 *
 * `classifyAlert` es PURA (sin Knex/Fastify) — mismo criterio que
 * `rolePolicy.ts` ("no depende de Knex ni de Fastify para poder testearse sin
 * base ni servidor"). El portal NUNCA duplica este mapa: consume `alert_class`/
 * `alert_reason`/`responder` ya resueltos (ver migración
 * `20260824010000_alerts_classification_and_origin.ts`) y la lista de clases
 * vía `GET /api/v1/alerts/classes`.
 */

export type AlertClass =
  | "consumable_out"
  | "consumable_low"
  | "system_failure"
  | "system_warning"
  | "user_action"
  | "system_change"
  | "jam"
  | "media_out"
  | "media_low"
  | "information"
  | "subunit_low"
  | "subunit_out"
  | "availability"
  | "other";

export type Responder = "none" | "untrained" | "trained" | "field_service" | "management";

export const ALERT_CLASS_LABELS: Record<AlertClass, string> = {
  consumable_out: "Consumible agotado",
  consumable_low: "Nivel bajo del consumible",
  system_failure: "Fallo del sistema",
  system_warning: "Advertencia del sistema",
  user_action: "Acción del usuario",
  system_change: "Cambio del sistema",
  jam: "Atasco",
  media_out: "Soporte fuera",
  media_low: "Soporte bajo",
  information: "Información",
  subunit_low: "Subunidad baja",
  subunit_out: "Subunidad fuera",
  availability: "Disponibilidad",
  other: "Otro",
};

export const RESPONDER_LABELS: Record<Responder, string> = {
  none: "Sin intervención",
  untrained: "Sin formación",
  trained: "Con formación",
  field_service: "Servicio de campo",
  management: "Gestión",
};

export interface AlertClassification {
  reason: string;
  klass: AlertClass;
  responder: Responder;
}

const REASON_MAX_LEN = 120;

/** Tipos que escribimos nosotros (no vienen de un equipo) — match exacto. */
const INTERNAL_TYPES: Record<string, AlertClassification> = {
  toner_black_low: { reason: "Nivel de tóner negro bajo", klass: "consumable_low", responder: "untrained" },
  toner_cyan_low: { reason: "Nivel de tóner cian bajo", klass: "consumable_low", responder: "untrained" },
  toner_magenta_low: { reason: "Nivel de tóner magenta bajo", klass: "consumable_low", responder: "untrained" },
  toner_yellow_low: { reason: "Nivel de tóner amarillo bajo", klass: "consumable_low", responder: "untrained" },
  toner_black_critical: { reason: "Tóner negro agotado", klass: "consumable_out", responder: "untrained" },
  toner_cyan_critical: { reason: "Tóner cian agotado", klass: "consumable_out", responder: "untrained" },
  toner_magenta_critical: { reason: "Tóner magenta agotado", klass: "consumable_out", responder: "untrained" },
  toner_yellow_critical: { reason: "Tóner amarillo agotado", klass: "consumable_out", responder: "untrained" },
  counter_reset: { reason: "Reinicio de contador detectado", klass: "system_change", responder: "management" },
  device_offline: { reason: "Equipo sin señal", klass: "availability", responder: "trained" },
  agent_offline: { reason: "Agente sin señal", klass: "availability", responder: "trained" },
  device_still_reporting: {
    reason: "Equipo dado de baja pero sigue reportando",
    klass: "information",
    responder: "management",
  },
  device_error: { reason: "Equipo sin señal", klass: "availability", responder: "trained" }, // legado, ver migración
  supply_non_genuine: {
    reason: "Consumible no original detectado",
    klass: "user_action",
    responder: "management",
  },
};

/** `prtAlertCode` (RFC 3805, `PrtAlertCodeTC`) — sólo los valores ya vistos en tráfico real. */
const PRT_ALERT_CODES: Record<string, AlertClassification> = {
  "8": { reason: "Atasco de papel", klass: "jam", responder: "untrained" },
  "22": { reason: "Bandeja/unidad en espera", klass: "information", responder: "none" },
  "23": { reason: "Modo de ahorro de energía activado", klass: "information", responder: "none" },
  "29": { reason: "Fallo recuperable del sistema", klass: "system_warning", responder: "field_service" },
  "30": { reason: "Fallo no recuperable del sistema", klass: "system_failure", responder: "field_service" },
  "501": { reason: "Puerta o cubierta abierta", klass: "user_action", responder: "untrained" },
  "503": { reason: "Encendido del equipo", klass: "information", responder: "none" },
  "504": { reason: "Apagado del equipo", klass: "information", responder: "none" },
  "807": { reason: "Papel bajo en la bandeja", klass: "media_low", responder: "untrained" },
  "808": { reason: "Bandeja sin papel", klass: "media_out", responder: "untrained" },
  "1101": { reason: "Tóner/tinta agotado", klass: "consumable_out", responder: "untrained" },
  "1104": { reason: "Tóner/tinta casi agotado", klass: "consumable_low", responder: "untrained" },
  "1107": { reason: "Consumible de mantenimiento casi agotado", klass: "subunit_low", responder: "untrained" },
  "1109": { reason: "Consumible de mantenimiento agotado", klass: "subunit_out", responder: "untrained" },
  "1111": { reason: "Unidad de imagen casi agotada", klass: "subunit_low", responder: "untrained" },
  "1112": { reason: "Unidad de imagen agotada", klass: "subunit_out", responder: "untrained" },
};

/** Espeja `ERROR_BITS` de `agent/src/capture/families/generic-printer-mib.ts:275-280`. */
const HR_ERROR_BITS: Record<string, AlertClassification> = {
  "0": { reason: "Papel bajo", klass: "media_low", responder: "untrained" },
  "1": { reason: "Sin papel", klass: "media_out", responder: "untrained" },
  "2": { reason: "Tóner bajo", klass: "consumable_low", responder: "untrained" },
  "3": { reason: "Sin tóner", klass: "consumable_out", responder: "untrained" },
  "4": { reason: "Puerta abierta", klass: "user_action", responder: "untrained" },
  "5": { reason: "Atasco de papel", klass: "jam", responder: "untrained" },
  "6": { reason: "Equipo fuera de línea", klass: "availability", responder: "trained" },
  "7": { reason: "Servicio técnico requerido", klass: "system_failure", responder: "field_service" },
  "8": { reason: "Bandeja de salida casi llena", klass: "subunit_low", responder: "untrained" },
  "9": { reason: "Bandeja de salida llena", klass: "subunit_out", responder: "untrained" },
  "10": { reason: "Entrada manual requerida", klass: "user_action", responder: "untrained" },
  "11": { reason: "Advertencia del subsistema de salida", klass: "system_warning", responder: "field_service" },
  "12": { reason: "Advertencia de entrada de papel", klass: "system_warning", responder: "field_service" },
  "13": { reason: "Advertencia del sistema", klass: "system_warning", responder: "field_service" },
  "14": { reason: "Servicio de mantenimiento requerido", klass: "system_warning", responder: "field_service" },
};

/** Override exacto para códigos Samsung puntuales ya vistos en la base. */
const VENDOR_EXACT: Record<string, AlertClassification> = {
  "M1-5612": { reason: "Bandeja multipropósito vacía", klass: "media_out", responder: "untrained" },
  "C2-1411": { reason: "Bandeja de salida llena", klass: "subunit_out", responder: "untrained" },
  "S2-3313": { reason: "Modo de ahorro de energía activado", klass: "information", responder: "none" },
};

/** Familias de vendor por prefijo — `C`=consumible, `S`=sistema, `M`=soporte/bandeja. */
const VENDOR_FAMILY_RX = /^([CSM])\d-\d{3,4}$/;
const VENDOR_FAMILY: Record<string, AlertClassification> = {
  C: { reason: "Alerta de consumible", klass: "consumable_low", responder: "untrained" },
  S: { reason: "Alerta del sistema", klass: "system_warning", responder: "field_service" },
  M: { reason: "Alerta de soporte de papel", klass: "media_low", responder: "untrained" },
};

const HR_CODE_RX = /^HR-(\d{1,2})$/;
const PRT_CODE_RX = /^\d{1,4}$/;

/** Recorta y limpia un mensaje crudo para usarlo como `reason` de fallback. */
function sanitize(message: string | null | undefined, type: string): string {
  let text = (message ?? "").trim();
  // Si el mensaje empieza repitiendo el código (caso HP: "1104 Cartridge low…"
  // o Samsung: "S2-3313 The machine is…"), se lo saca — el código ya vive en
  // `alerts.type` y se muestra aparte (columna "Código" en la UI).
  if (text.startsWith(type)) {
    text = text.slice(type.length).trim();
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return type;
  return text.length > REASON_MAX_LEN ? text.slice(0, REASON_MAX_LEN - 1) + "…" : text;
}

/**
 * Clasifica una alerta por su `type` (y opcionalmente su `message` crudo, usado
 * sólo como fallback de `reason`). Total: nunca lanza, siempre devuelve algo.
 */
export function classifyAlert(type: string, message?: string | null): AlertClassification {
  // Defensivo: `type` es `string` por firma, pero `openAlert` recibe datos que
  // en la práctica pueden venir de una fila de base o de un objeto armado a mano
  // sin pasar por el compilador (JS puro en algún call-site futuro) — nunca debe
  // reventar la ingesta por esto.
  const trimmed = (type ?? "").trim();
  if (!trimmed) {
    const fallbackReason = sanitize(message, "");
    return { reason: fallbackReason || "Alerta sin tipo", klass: "other", responder: "trained" };
  }

  const internal = INTERNAL_TYPES[trimmed];
  if (internal) return internal;

  if (PRT_CODE_RX.test(trimmed)) {
    const known = PRT_ALERT_CODES[trimmed];
    if (known) return known;
  }

  const hrMatch = trimmed.match(HR_CODE_RX);
  if (hrMatch) {
    const known = HR_ERROR_BITS[hrMatch[1]];
    if (known) return known;
  }

  const vendorExact = VENDOR_EXACT[trimmed];
  if (vendorExact) return vendorExact;

  const familyMatch = trimmed.match(VENDOR_FAMILY_RX);
  if (familyMatch) {
    const base = VENDOR_FAMILY[familyMatch[1]];
    if (base) return { ...base, reason: sanitize(message, trimmed) || base.reason };
  }

  return { reason: sanitize(message, trimmed), klass: "other", responder: "trained" };
}

/**
 * Reclasifica alertas existentes en lotes (usado por la migración de backfill y,
 * en el futuro, si el catálogo crece). `onlyNull: true` sólo toca filas sin
 * clasificar todavía — una migración vieja re-corrida en una base limpia usa el
 * catálogo ACTUAL (es metadata derivada, no historia; ver docblock de la
 * migración `20260824010000`).
 */
export async function backfillAlertClassification(
  knex: Knex,
  opts: { onlyNull: boolean } = { onlyNull: true }
): Promise<number> {
  const BATCH_SIZE = 5000;
  let totalUpdated = 0;

  for (;;) {
    const query = knex("alerts").select("id", "type", "message").orderBy("id").limit(BATCH_SIZE);
    if (opts.onlyNull) query.whereNull("alert_class");
    const rows: Array<{ id: number; type: string; message: string | null }> = await query;
    if (rows.length === 0) break;

    await knex.transaction(async (trx) => {
      for (const row of rows) {
        const { reason, klass, responder } = classifyAlert(row.type, row.message);
        await trx("alerts")
          .where("id", row.id)
          .update({ alert_class: klass, alert_reason: reason, responder });
      }
    });

    totalUpdated += rows.length;
    if (!opts.onlyNull || rows.length < BATCH_SIZE) break;
  }

  return totalUpdated;
}
