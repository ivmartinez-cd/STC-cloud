import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getScope } from "../../utils/scope";
import { onlyLiveDevices } from "../../utils/deviceFilters";
import { deviceSupplies } from "../../../services/suppliesService";
import { UUID_RE } from "./shared";

async function listDevices(db: Knex, request: FastifyRequest) {
  const scope = getScope(request);
  const { include } = request.query as { include?: string };
  const includeDecommissioned = include === "decommissioned" || include === "all";

  return await db("devices")
    .join("agents", "devices.agent_id", "agents.id")
    .join("clients", "devices.client_id", "clients.id")
    .modify((q) => {
      if (!includeDecommissioned) onlyLiveDevices(q, "devices");
      else q.whereNull("devices.merged_into"); // las lápidas nunca se listan
      if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
    })
    .select(
      "devices.*",
      db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
      "agents.name as monitor_name",
      "agents.status as agent_status",
      "agents.last_seen as agent_last_seen",
      "clients.name as client_name"
    )
    .orderBy("clients.name")
    // Sin ruta activa en el portal hoy (Devices.tsx no está montada en
    // App.tsx), pero el endpoint sigue vivo — techo de seguridad igual
    // que listAgents/listClients, más alto acá porque dispositivos es la
    // tabla de mayor volumen (200 clientes × decenas c/u).
    .limit(5000);
}

async function getDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const isUuid = UUID_RE.test(id);

  // Sin filtro de ciclo de vida a propósito: la ficha de un equipo dado de
  // baja o fusionado tiene que seguir abriendo (es exactamente el dato que
  // la baja protege; una lápida necesita mostrar hacia dónde se fusionó).
  const device = await db("devices")
    .where(function () {
      if (isUuid) {
        this.where("devices.id", id);
      } else {
        this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
          .orWhere("devices.serial_number", id)
          .orWhereRaw("devices.ip_address::text = ?", [id]);
      }
    })
    .modify((q) => {
      if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
    })
    .select(
      "devices.*",
      db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
      "agents.name as monitor_name",
      "agents.status as agent_status",
      "agents.last_seen as agent_last_seen",
      "clients.name as client_name",
      "merged_target.serial_number as merged_into_serial",
      "u30.pages_30d", "u30.mono_30d", "u30.color_30d",
      db.raw("COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) as duty_cycle_effective"),
      db.raw(`
        CASE WHEN COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) > 0
             THEN round(100.0 * COALESCE(u30.pages_30d, 0) / COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly))
        END as utilization_pct
      `)
    )
    .leftJoin("agents", "agents.id", "devices.agent_id")
    .join("clients", "clients.id", "devices.client_id")
    .leftJoin("devices as merged_target", "merged_target.id", "devices.merged_into")
    .leftJoin("device_usage_30d as u30", "u30.device_id", "devices.id")
    .leftJoin("device_models as dm", function () {
      this.on(db.raw("lower(dm.brand) = lower(devices.brand)"))
        .andOn(db.raw("dm.model_key = lower(btrim(devices.model))"));
    })
    .first();
  if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
  return device;
}

async function getDeviceReadings(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { from, to, limit } = request.query as { from?: string; to?: string; limit?: string };
  const scope = getScope(request);
  const isUuid = UUID_RE.test(id);

  // Sin filtro de ciclo de vida: el historial de un equipo dado de baja o
  // fusionado sigue siendo consultable — es justo lo que la baja protege.
  const owned = await db("devices")
    .where(function () {
      if (isUuid) {
        this.where("devices.id", id);
      } else {
        this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
          .orWhere("devices.serial_number", id)
          .orWhereRaw("devices.ip_address::text = ?", [id]);
      }
    })
    .modify((q) => {
      if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
    })
    .select("devices.id")
    .first();
  if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });
  const targetId = owned.id;

  const query = db("readings")
    .where({ device_id: targetId })
    .whereNotNull("total_pages")
    .where("total_pages", ">", 0)
    .orderBy("time", "desc")
    .limit(Math.min(Number(limit) || 500, 5000));

  if (from) query.where("time", ">=", new Date(from));
  if (to) query.where("time", "<=", new Date(to));

  return await query.select("*", db.raw("CASE WHEN offline = true THEN 'offline' ELSE 'online' END as status"));
}

// Fase 8 del gap analysis vs HP SDS — detalle de consumibles de un equipo,
// ahora calculado del lado servidor (única implementación, ver
// `suppliesService.ts`) en vez de client-side en `DeviceDetail.tsx`.
async function getDeviceSupplies(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const isUuid = UUID_RE.test(id);

  const owned = await db("devices")
    .where(function () {
      if (isUuid) {
        this.where("devices.id", id);
      } else {
        this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
          .orWhere("devices.serial_number", id)
          .orWhereRaw("devices.ip_address::text = ?", [id]);
      }
    })
    .modify((q) => {
      if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
    })
    .select("devices.id")
    .first();
  if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });

  const result = await deviceSupplies(db, owned.id);
  if (!result) return reply.status(404).send({ error: "Dispositivo no encontrado" });
  return result;
}

/**
 * Historial de uso desde los agregados continuos (`readings_daily_agg`/
 * `readings_monthly_agg`, migración `20260823050000`) — pensado para
 * gráficos de tendencia de largo plazo sin escanear `readings` crudo.
 * Sólo visualización: último valor del período por dispositivo, NO
 * deltas validados contra counter_reset (eso sigue siendo
 * `reportService.ts`/`report_closures`, la fuente de verdad de
 * facturación). Sobrevive a la retención de 2 años sobre `readings`
 * crudo — el agregado ya materializado no depende de la fila cruda.
 * OJO: no es de lectura inmediata — una lectura recién insertada
 * aparece acá recién con el próximo refresh programado (1h para
 * diario, 6h para mensual), no al instante como `/readings` crudo.
 */
async function getDeviceUsageHistory(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { granularity, limit } = request.query as { granularity?: string; limit?: string };
  const scope = getScope(request);
  const isUuid = UUID_RE.test(id);

  const owned = await db("devices")
    .where(function () {
      if (isUuid) this.where("devices.id", id);
      else this.whereRaw("devices.id::text LIKE ?", [`${id}%`]).orWhere("devices.serial_number", id);
    })
    .modify((q) => {
      if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
    })
    .select("devices.id")
    .first();
  if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });

  const isMonthly = granularity === "monthly";
  const table = isMonthly ? "readings_monthly_agg" : "readings_daily_agg";
  const bucketCol = isMonthly ? "month" : "day";

  return db(table)
    .where({ device_id: owned.id })
    .orderBy(bucketCol, "desc")
    .limit(Math.min(Number(limit) || 90, 365))
    .select(
      `${bucketCol} as period`,
      "total_pages", "mono_pages", "color_pages", "reading_count",
      ...(isMonthly ? [] : ["toner_black", "toner_cyan", "toner_magenta", "toner_yellow"])
    );
}

export function createDeviceReadHandlers(db: Knex) {
  return {
    listDevices: (request: FastifyRequest) => listDevices(db, request),
    getDevice: (request: FastifyRequest, reply: FastifyReply) => getDevice(db, request, reply),
    getDeviceReadings: (request: FastifyRequest, reply: FastifyReply) => getDeviceReadings(db, request, reply),
    getDeviceSupplies: (request: FastifyRequest, reply: FastifyReply) => getDeviceSupplies(db, request, reply),
    getDeviceUsageHistory: (request: FastifyRequest, reply: FastifyReply) => getDeviceUsageHistory(db, request, reply),
  };
}
