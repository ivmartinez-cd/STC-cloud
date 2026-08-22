import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import { getScope } from "../utils/scope";
import { onlyLiveDevices } from "../utils/deviceFilters";
import {
  mergeDevices,
  MergeError,
  MergeOverlapError,
} from "../../services/deviceLifecycleService";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentUser(request: FastifyRequest): PortalUser | undefined {
  return (request as FastifyRequest & { user?: PortalUser }).user;
}

export function createDeviceController(db: Knex) {
  return {
    listDevices: async (request: FastifyRequest) => {
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
        .orderBy("clients.name");
    },

    getDevice: async (request: FastifyRequest, reply: FastifyReply) => {
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
          "merged_target.serial_number as merged_into_serial"
        )
        .leftJoin("agents", "agents.id", "devices.agent_id")
        .join("clients", "clients.id", "devices.client_id")
        .leftJoin("devices as merged_target", "merged_target.id", "devices.merged_into")
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      return device;
    },

    getDeviceReadings: async (request: FastifyRequest, reply: FastifyReply) => {
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
    },

    updateDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const body = request.body as Partial<{ name: string | null; location: string | null }>;

      const existing = await db("devices")
        .where({ id })
        .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
        .first();
      if (!existing) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      if (existing.merged_into) {
        return reply.status(409).send({ error: "No se puede editar un registro fusionado" });
      }

      const updates: Record<string, unknown> = {};
      // "" o null -> vuelve al valor reportado por el agente (COALESCE de la
      // columna generada ya lo resuelve solo con el override en NULL).
      if (body.name !== undefined) updates.name_override = body.name?.trim() || null;
      if (body.location !== undefined) updates.location_override = body.location?.trim() || null;
      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "Nada para actualizar" });
      }

      const [updated] = await db("devices").where({ id }).update(updates).returning("*");
      const user = currentUser(request);
      await db("audit_logs").insert({
        action: "DEVICE_UPDATED",
        target_id: String(id),
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ changes: Object.keys(updates) }),
      });
      return updated;
    },

    decommissionDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const { reason } = request.body as { reason?: string };
      if (!reason || !reason.trim()) {
        return reply.status(400).send({ error: "El motivo es obligatorio" });
      }

      const user = currentUser(request);
      try {
        const result = await db.transaction(async (trx) => {
          const device = await trx("devices")
            .where({ id })
            .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
            .forUpdate()
            .first();
          if (!device) throw { status: 404, error: "Dispositivo no encontrado" };
          if (device.merged_into) throw { status: 409, error: "Un registro fusionado no se puede dar de baja" };
          if (device.decommissioned_at) return device; // idempotente

          const [updated] = await trx("devices").where({ id }).update({
            decommissioned_at: new Date(),
            decommissioned_by: user?.userId ?? null,
            decommission_reason: reason.trim(),
            active: false,
          }).returning("*");

          // Resolver TODAS sus alertas abiertas en la misma transacción: si no,
          // `device_offline` queda abierta para siempre (su resolución exige
          // last_seen >= cutoff, que un equipo dado de baja nunca vuelve a
          // cumplir) y una alerta crítica reabierta seguiría notificando al
          // cliente por un equipo que ya retiró.
          const alertsResolved = await trx("alerts")
            .where({ device_id: id, resolved: false })
            .update({ resolved: true, resolved_at: new Date() });

          await trx("audit_logs").insert({
            action: "DEVICE_DECOMMISSIONED",
            target_id: String(id),
            user_id: user?.userId ?? null,
            ip_address: getClientIp(request),
            metadata: JSON.stringify({
              serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
              agent_id: device.agent_id, client_id: device.client_id, last_seen: device.last_seen,
              total_pages: device.total_pages, reason: reason.trim(), alerts_resolved: alertsResolved,
            }),
          });

          return updated;
        });
        return result;
      } catch (e: any) {
        if (e?.status) return reply.status(e.status).send({ error: e.error });
        throw e;
      }
    },

    recommissionDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const { reason } = request.body as { reason?: string };

      const device = await db("devices")
        .where({ id })
        .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      if (device.merged_into) return reply.status(409).send({ error: "Un registro fusionado no se puede reactivar" });

      const [updated] = await db("devices").where({ id }).update({
        decommissioned_at: null, decommissioned_by: null, decommission_reason: null,
      }).returning("*");

      const user = currentUser(request);
      await db("audit_logs").insert({
        action: "DEVICE_RECOMMISSIONED",
        target_id: String(id),
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ reason: reason?.trim() || null }),
      });
      return updated;
    },

    moveDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const { agentId, reason, confirmClientChange } = request.body as {
        agentId?: string; reason?: string; confirmClientChange?: boolean;
      };
      if (!agentId) return reply.status(400).send({ error: "agentId es requerido" });
      if (!reason || !reason.trim()) return reply.status(400).send({ error: "El motivo es obligatorio" });

      const user = currentUser(request);
      try {
        const result = await db.transaction(async (trx) => {
          const device = await trx("devices")
            .where({ id })
            .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
            .forUpdate()
            .first();
          if (!device) throw { status: 404, error: "Dispositivo no encontrado" };
          if (device.merged_into) throw { status: 409, error: "Un registro fusionado no se puede mover" };

          const targetAgent = await trx("agents").where({ id: agentId }).first();
          if (!targetAgent || targetAgent.status === "revoked") throw { status: 404, error: "Monitor destino no encontrado" };
          if (scope.kind === "client" && targetAgent.client_id !== scope.id) {
            throw { status: 404, error: "Monitor destino no encontrado" };
          }
          if (agentId === device.agent_id) throw { status: 400, error: "El equipo ya pertenece a ese monitor" };

          const clientChanged = targetAgent.client_id !== device.client_id;
          if (clientChanged && !confirmClientChange) {
            throw { status: 400, error: "Cambiar de cliente requiere confirmClientChange: true" };
          }

          // client_id se DERIVA del agente destino, nunca del body: tocar uno y
          // no el otro deja al equipo visible para dos clientes a la vez.
          if (device.serial_number) {
            const collision = await trx("devices")
              .where("client_id", targetAgent.client_id)
              .whereRaw("upper(btrim(serial_number)) = upper(?)", [device.serial_number])
              .whereNot("id", device.id)
              .whereNull("merged_into")
              .first();
            if (collision) {
              throw {
                status: 409,
                error: "Ya existe este equipo en el cliente destino — usá Fusionar",
                collisionId: collision.id,
              };
            }
          }

          const [updated] = await trx("devices").where({ id }).update({
            agent_id: agentId,
            client_id: targetAgent.client_id,
            agent_reassigned_at: new Date(),
          }).returning("*");

          // Las alertas abiertas cruzarían de tenant al mover (getAlerts scopea
          // por devices.client_id) y pueden contener datos del sitio anterior.
          const alertsResolved = await trx("alerts")
            .where({ device_id: id, resolved: false })
            .update({ resolved: true, resolved_at: new Date() });

          await trx("audit_logs").insert({
            action: "DEVICE_MOVED",
            target_id: String(id),
            user_id: user?.userId ?? null,
            ip_address: getClientIp(request),
            metadata: JSON.stringify({
              from_agent_id: device.agent_id, to_agent_id: agentId,
              from_client_id: device.client_id, to_client_id: targetAgent.client_id,
              client_changed: clientChanged, reason: reason.trim(), alerts_resolved: alertsResolved,
            }),
          });

          return updated;
        });
        return result;
      } catch (e: any) {
        if (e?.status) return reply.status(e.status).send({ error: e.error, ...(e.collisionId ? { collisionId: e.collisionId } : {}) });
        throw e;
      }
    },

    mergeDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const { sourceDeviceId, reason, onOverlap, dryRun, force } = request.body as {
        sourceDeviceId?: string; reason?: string; onOverlap?: "abort" | "keep_target" | "keep_source";
        dryRun?: boolean; force?: boolean;
      };
      if (!sourceDeviceId) return reply.status(400).send({ error: "sourceDeviceId es requerido" });
      if (sourceDeviceId === id) return reply.status(400).send({ error: "No se puede fusionar un equipo consigo mismo" });

      if (scope.kind === "client") {
        const owned = await db("devices").whereIn("id", [id, sourceDeviceId]).where("client_id", scope.id).count("id as c").first();
        if (Number(owned?.c) < 2) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      }

      const user = currentUser(request);
      try {
        if (dryRun) {
          // dryRun real (sin mutar) requeriría duplicar buena parte de la lógica
          // de mergeDevices; en su lugar corremos el merge real dentro de una
          // transacción que SIEMPRE se revierte, y devolvemos el resultado. El
          // costo (bloqueos breves de FOR UPDATE) es aceptable para una acción
          // manual poco frecuente.
          let planResult: any = null;
          await db.transaction(async (trx) => {
            planResult = await mergeDevices(db, {
              targetId: id, sourceId: sourceDeviceId, reason: "manual", actor: "portal",
              userId: user?.userId ?? null, ip: getClientIp(request), requestReason: reason ?? null,
              onOverlap, force,
            }, trx);
            throw { __rollback: true };
          }).catch((e) => { if (!e?.__rollback) throw e; });
          return { dryRun: true, plan: planResult };
        }

        const result = await mergeDevices(db, {
          targetId: id, sourceId: sourceDeviceId, reason: "manual", actor: "portal",
          userId: user?.userId ?? null, ip: getClientIp(request), requestReason: reason ?? null,
          onOverlap, force,
        });
        return result;
      } catch (e: unknown) {
        if (e instanceof MergeOverlapError) {
          return reply.status(409).send({
            error: e.message, from: e.from, to: e.to, sourceCount: e.sourceCount, targetCount: e.targetCount,
          });
        }
        if (e instanceof MergeError) {
          // Incluye el caso "no existe" (mergeDevices no distingue eso con un
          // tipo propio) — 409 es razonable igual: el cuerpo del error explica
          // por qué, y no se trata como oráculo de existencia porque ambos ids
          // ya se validaron contra el scope del llamador arriba.
          return reply.status(409).send({ error: e.message });
        }
        throw e;
      }
    },

    listDuplicates: async (request: FastifyRequest, reply: FastifyReply) => {
      const scope = getScope(request);
      const { client_id, agent_id } = request.query as { client_id?: string; agent_id?: string };
      const effectiveClientId = scope.kind === "client" ? scope.id : client_id;
      if (!effectiveClientId) return reply.status(400).send({ error: "client_id es requerido" });

      // Self-join de pares vivos del mismo cliente, por MAC, por IP-fantasma en
      // la misma sede, o por serial coincidente entre monitores distintos (el
      // caso que motiva la clave por cliente en primer lugar).
      const rows = await db.raw(
        `SELECT a.id AS a_id, a.serial_number AS a_serial, a.mac AS a_mac, a.ip_address AS a_ip,
                a.agent_id AS a_agent_id, a.last_seen AS a_last_seen,
                b.id AS b_id, b.serial_number AS b_serial, b.mac AS b_mac, b.ip_address AS b_ip,
                b.agent_id AS b_agent_id, b.last_seen AS b_last_seen,
                CASE
                  WHEN a.mac IS NOT NULL AND a.mac = b.mac THEN 'same_mac'
                  WHEN a.agent_id = b.agent_id AND a.ip_address = b.ip_address
                    AND (a.serial_number IS NULL OR a.serial_number = host(a.ip_address)
                         OR b.serial_number IS NULL OR b.serial_number = host(b.ip_address))
                    THEN 'ghost_same_ip'
                  WHEN upper(btrim(a.serial_number)) = upper(btrim(b.serial_number)) AND a.agent_id <> b.agent_id
                    THEN 'same_serial_different_monitor'
                  ELSE 'same_hostname'
                END AS reason
           FROM devices a JOIN devices b ON a.id < b.id
          WHERE a.client_id = ? AND b.client_id = ?
            AND a.decommissioned_at IS NULL AND a.merged_into IS NULL
            AND b.decommissioned_at IS NULL AND b.merged_into IS NULL
            AND (
              (a.mac IS NOT NULL AND a.mac = b.mac)
              OR (a.agent_id = b.agent_id AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address)
              OR (a.serial_number IS NOT NULL AND upper(btrim(a.serial_number)) = upper(btrim(b.serial_number)))
              OR (a.hostname IS NOT NULL AND a.hostname = b.hostname)
            )
            ${agent_id ? "AND (a.agent_id = ? OR b.agent_id = ?)" : ""}
          LIMIT 200`,
        agent_id ? [effectiveClientId, effectiveClientId, agent_id, agent_id] : [effectiveClientId, effectiveClientId]
      );
      return rows.rows;
    },

    deleteDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      try {
        await db.transaction(async (trx) => {
          const device = await trx("devices")
            .where({ id })
            .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
            .first();
          if (!device) throw new Error("Dispositivo no encontrado");

          const hasClosureLines = await trx("report_closure_lines").where({ device_id: id }).first();
          if (hasClosureLines) {
            throw Object.assign(new Error("Tiene historial de facturación; dalo de baja en vez de eliminarlo"), { status: 409 });
          }
          const isMergeTarget = await trx("devices").where({ merged_into: id }).first();
          if (isMergeTarget) {
            throw Object.assign(new Error("Es destino de una fusión; no se puede eliminar"), { status: 409 });
          }

          await trx("readings").where("device_id", id).del();
          await trx("alerts").where("device_id", id).del();
          const deleted = await trx("devices").where("id", id).del();
          if (!deleted) throw new Error("Dispositivo no encontrado");

          const user = currentUser(request);
          await trx("audit_logs").insert({
            action: "DEVICE_DELETED",
            target_id: id,
            user_id: user?.userId ?? null,
            ip_address: getClientIp(request),
            metadata: JSON.stringify({
              serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
              brand: device.brand, model: device.model, agent_id: device.agent_id, client_id: device.client_id,
              total_pages: device.total_pages,
            }),
          });
        });

        return { success: true, message: "Dispositivo eliminado correctamente" };
      } catch (e: any) {
        const status = e?.status ?? 404;
        return reply.status(status).send({ error: e?.message ?? String(e) });
      }
    },

    // `DELETE /devices/offline` (borrado en duro por agent_id de query param,
    // sin ownership, con `active=false` como criterio) fue REEMPLAZADO por
    // `decommissionStaleDevices` de abajo, colgado de /agents/:id — hereda el
    // chequeo central de ownership, dado de baja en vez de borrado, dry-run,
    // y devuelve siempre la lista completa en vez de sólo el conteo.
    decommissionStaleDevices: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: agentId } = request.params as { id: string };
      const { inactiveDays, dryRun, reason } = request.body as {
        inactiveDays?: number; dryRun?: boolean; reason?: string;
      };
      const days = Math.min(365, Math.max(7, inactiveDays ?? 30));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const targets = await db("devices")
        .where("agent_id", agentId)
        .modify((q) => onlyLiveDevices(q, "devices"))
        .whereRaw("COALESCE(last_seen, created_at) < ?", [cutoff])
        .select("id", "serial_number", "model", "ip_address", "last_seen");

      if (dryRun) {
        return { count: targets.length, devices: targets };
      }
      if (targets.length === 0) {
        return { count: 0, devices: [] };
      }

      const ids = targets.map((t: { id: string }) => t.id);
      const user = currentUser(request);
      await db.transaction(async (trx) => {
        await trx("devices").whereIn("id", ids).update({
          decommissioned_at: new Date(),
          decommissioned_by: user?.userId ?? null,
          decommission_reason: reason?.trim() || `Sin actividad por ${days} días (purga automática)`,
          active: false,
        });
        await trx("alerts").whereIn("device_id", ids).where("resolved", false).update({
          resolved: true, resolved_at: new Date(),
        });
        await trx("audit_logs").insert({
          action: "DEVICES_BULK_DECOMMISSIONED",
          target_id: agentId,
          user_id: user?.userId ?? null,
          ip_address: getClientIp(request),
          metadata: JSON.stringify({ agent_id: agentId, inactive_days: days, count: ids.length, device_ids: ids, reason: reason?.trim() || null }),
        });
      });

      return { count: ids.length, devices: targets };
    },
  };
}
