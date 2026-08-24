import type { Knex } from "knex";
import crypto from "crypto";
import { resolveDeviceIdentity } from "../deviceIdentity";
import { logger } from "../../logger";
import type { IncomingDevice } from "./types";

/** Alta/actualización de dispositivos descubiertos por el agente. */
export class AgentDeviceRegistrationService {
  constructor(private db: Knex) {}

  /**
   * Registra o actualiza dispositivos de impresión descubiertos por el agente.
   * Identidad por CLIENTE (serial -> mac -> ip, ver deviceIdentity.ts) — ya NO
   * usa `ON CONFLICT (agent_id, serial_number)`: ese índice sigue existiendo
   * (lo dropea recién la migración de dedupe, condicional), pero atarse a él
   * en código es lo que impedía tocarlo sin romper la ingesta. El `catch` de
   * `23505` reintenta el lookup una vez, para la carrera entre dos requests
   * de `/devices/register` concurrentes sobre la misma impresora nueva.
   * @param agentId - UUID del agente que reporta los dispositivos.
   * @param devices - Array de dispositivos descubiertos en la red local del cliente.
   */
  async registerDevices(agentId: string, devices: IncomingDevice[]) {
    // Fase 7 del gap analysis vs HP SDS: `device_approval_required` se lee acá
    // (join a `clients`, no una query aparte) porque ESTE es el camino donde
    // de verdad puede nacer una fila nueva de `devices` — `syncReadings` corre
    // después y en el 99% de los casos sólo actualiza lo que este método ya
    // creó. Si sólo se aplicara el gate en `syncReadings`, un equipo nuevo
    // quedaría `registered` igual (creado acá primero) y la cola de Fase 7
    // nunca lo vería.
    const agentRow = await this.db("agents")
      .leftJoin("clients", "agents.client_id", "clients.id")
      .where("agents.id", agentId)
      .select("agents.client_id", "clients.device_approval_required")
      .first();
    const clientId: string | null = agentRow?.client_id ?? null;
    const approvalRequired = agentRow?.device_approval_required ?? false;

    for (const device of devices) {
      try {
        const ip = device.ip;
        const serial = (device.serial || "").trim() || null;
        const mac = device.mac ?? null;

        if (!clientId) {
          // Agente huérfano (sin client_id) — no debería ocurrir en producción,
          // pero no puede tumbar el registro. Fallback al comportamiento previo,
          // scopeado por agente.
          await this.registerDeviceLegacyByAgent(agentId, device);
          continue;
        }

        const attemptUpsert = async () => {
          await this.db.transaction(async (trx) => {
            const { device: existing } = await resolveDeviceIdentity(trx, {
              clientId, agentId, serial, mac, ip,
            });

            if (existing) {
              if (existing.agent_id !== agentId) {
                // resolveDeviceIdentity ya decidió (sticky, ver deviceIdentity.ts)
                // si corresponde re-apuntar agent_id o no; acá sólo actualizamos
                // el resto de los campos descriptivos.
              }
              // `ignored` (Fase 7): no revivir por su cuenta — mismo criterio
              // que `disabled` (Fase 5), sólo señal de "sigue vivo".
              if (existing.registration_state === "ignored") {
                await trx("devices").where("id", existing.id).update({
                  ip_address: ip || existing.ip_address,
                  last_seen: new Date(),
                  active: true,
                });
                return;
              }
              await trx("devices").where("id", existing.id).update({
                ip_address: ip || existing.ip_address,
                serial_number: serial || existing.serial_number,
                mac: mac || existing.mac,
                brand: device.brand && device.brand !== 'unknown' ? device.brand : undefined,
                model: device.model || undefined,
                name_reported: device.name || undefined,
                last_seen: new Date(),
                active: true,
              });
              return;
            }

            const newId = crypto.randomUUID();
            await trx("devices").insert({
              id: newId,
              agent_id: agentId,
              client_id: clientId,
              ip_address: device.ip,
              serial_number: serial,
              mac,
              brand: device.brand || 'unknown',
              model: (device.model || "").slice(0, 100),
              name_reported: (device.name || "").slice(0, 100),
              active: true,
              last_seen: new Date(),
              // Fase 7 del gap analysis vs HP SDS.
              registration_state: approvalRequired ? "pending" : "registered",
            });
          });
        };

        try {
          await attemptUpsert();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/duplicate key|23505/i.test(msg)) {
            // Carrera con otro registro concurrente: reintentar una vez, ahora
            // debería resolver por el lookup en vez de insertar.
            await attemptUpsert();
          } else {
            throw err;
          }
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error({ err: errMsg }, `[AGENT_SERVICE] Error registering device ${device.ip}`);
      }
    }
  }

  /** Fallback legacy (scopeado por agente) para el caso, no esperado en producción,
   *  de un agente sin client_id resuelto. No usa la escalera de identidad nueva. */
  private async registerDeviceLegacyByAgent(agentId: string, device: IncomingDevice) {
    const ip = device.ip;
    const serial = (device.serial || "").trim();
    const isRealSerial = serial.length > 0 && serial !== ip;

    const existingDevices = await this.db("devices")
      .where({ agent_id: agentId, ip_address: ip })
      .whereNull("merged_into")
      .select("id");

    if (existingDevices.length > 0) {
      await this.db("devices")
        .where("id", existingDevices[0].id)
        .update({
          serial_number: isRealSerial ? serial : undefined,
          last_seen: new Date(),
          active: true,
        });
      return;
    }

    await this.db("devices").insert({
      id: crypto.randomUUID(),
      agent_id: agentId,
      ip_address: ip,
      serial_number: isRealSerial ? serial : null,
      brand: device.brand || 'unknown',
      model: (device.model || "").slice(0, 100),
      name_reported: (device.name || "").slice(0, 100),
      active: true,
      last_seen: new Date(),
    });
  }
}
