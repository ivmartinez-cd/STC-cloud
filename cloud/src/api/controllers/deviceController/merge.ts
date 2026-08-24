import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getClientIp } from "../../utils/ip";
import { getScope } from "../../utils/scope";
import { mergeDevices, MergeError, MergeOverlapError } from "../../../services/deviceLifecycleService";
import { currentUser } from "./shared";

async function mergeDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
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
}

async function listDuplicates(db: Knex, request: FastifyRequest, reply: FastifyReply) {
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
}

export function createDeviceMergeHandlers(db: Knex) {
  return {
    mergeDevice: (request: FastifyRequest, reply: FastifyReply) => mergeDevice(db, request, reply),
    listDuplicates: (request: FastifyRequest, reply: FastifyReply) => listDuplicates(db, request, reply),
  };
}
