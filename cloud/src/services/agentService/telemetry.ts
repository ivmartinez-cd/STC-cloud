import type { Knex } from "knex";
import crypto from "crypto";
import net from "net";
import { Queue } from "bullmq";
import * as alertService from "../alertService";
import { resolveDeviceIdentity } from "../deviceIdentity";
import { mergeDevices } from "../deviceLifecycleService";
import { resolveSupplyOrigin } from "../supplyOrigin";
import { DEFAULT_BUSINESS_HOURS, parseNaiveLocalTimestamp } from "../businessHours";
import { logger } from "../../logger";
import { mergeSuppliesDetails, skuFrom, assetNumberFrom, isValidUuid, mapWithConcurrency } from "./reading-helpers";
import type { IncomingLogEntry, IncomingReading, MappedReading, RedisClient, SystemInfoPayload } from "./types";

/** Ingesta de telemetría (lecturas, logs) y heartbeat de agentes DCA. */
export class AgentTelemetryService {
  constructor(private db: Knex, private redis?: RedisClient) {}

  /**
   * Ingesta de logs remotos enviados por el agente DCA.
   * Soporta timestamps en formato DD/MM/YYYY (agentes viejos, pre-ISO) y
   * ISO 8601 (agente actual).
   * @param agentId - UUID del agente emisor.
   * @param logs - Array de entradas de log con timestamp, nivel y mensaje.
   * @param timezone - TZ IANA del agente (resuelta por `agentAuth`, ver
   *   `authMiddleware.ts`) — sólo se usa para interpretar timestamps naive
   *   `DD/MM/YYYY` de binarios viejos; el agente actual manda ISO-UTC que no
   *   la necesita. Default: `DEFAULT_BUSINESS_HOURS.timezone`.
   */
  async ingestLogs(agentId: string, logs: IncomingLogEntry[], timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    if (!logs || logs.length === 0) return;

    const rows = logs.map(l => {
      let ts: Date | null = null;
      const raw = l.timestamp || l.time; // Soportar ambos nombres de campo

      if (raw) {
        ts = parseNaiveLocalTimestamp(String(raw), timezone) ?? new Date(raw);
      } else {
        ts = new Date();
      }

      return {
        agent_id: agentId,
        level: l.level || 'INFO',
        message: l.message,
        timestamp: (!ts || isNaN(ts.getTime())) ? new Date() : ts
      };
    });

    await this.db("agent_logs").insert(rows);
  }

  async getLogs(agentId: string, limit: number = 50) {
    return await this.db("agent_logs")
      .where({ agent_id: agentId })
      .orderBy("timestamp", "desc")
      .limit(limit);
  }

  /**
   * Registra un latido (heartbeat) del agente, actualizando su último contacto
   * e información de sistema operativo del host.
   * @param agentId - UUID del agente emisor.
   * @param systemInfo - Datos opcionales del sistema (versión, hostname, OS, IP).
   */
  async heartbeat(agentId: string, systemInfo?: SystemInfoPayload) {
    if (!agentId) return;
    const updateData: Record<string, any> = {
      last_seen: new Date(),
    };

    if (systemInfo) {
      if (systemInfo.version !== undefined) updateData.version = systemInfo.version;
      if (systemInfo.host_name !== undefined) updateData.host_name = systemInfo.host_name;
      if (systemInfo.host_os !== undefined) updateData.host_os = systemInfo.host_os;
      if (systemInfo.host_ip !== undefined) updateData.host_ip = systemInfo.host_ip;
      if (systemInfo.uptime !== undefined) updateData.uptime = systemInfo.uptime;
    }

    await this.db("agents")
      .where({ id: agentId })
      .update(updateData);

    await this.db("agents")
      .where({ id: agentId, status: "offline" })
      .update({ status: "active" });
  }

  // Actualiza o crea dispositivos y registra lecturas
  /**
   * Sincroniza lecturas de telemetría desde el agente hacia la base de datos cloud.
   * Para cada lectura, realiza un UPSERT del dispositivo por serial_number y
   * registra la lectura en el historial de la tabla `readings`.
   *
   * @remarks
   * - La identidad del dispositivo se resuelve por CLIENTE (serial -> mac -> ip,
   *   ver `deviceIdentity.resolveDeviceIdentity`), no por agente — dos agentes
   *   del mismo cliente que ven la misma impresora física convergen a una sola
   *   fila. `resolveDeviceIdentity` toma un advisory lock por identidad para
   *   serializar sincronizaciones concurrentes, sin depender de un índice único.
   * - Los contadores se parsean con validación estricta (parseCount/parseToner).
   *
   * @param redis - Cliente Redis para encolar evaluaciones de alertas asíncronas.
   * @param readings - Array de lecturas crudas enviadas por el agente DCA.
   * @param agentId - UUID del agente emisor de la telemetría.
   */
  async syncReadings(redis: RedisClient, readings: IncomingReading[], agentId: string, timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    if (!readings || readings.length === 0) return { received: 0, inserted: 0, duplicates: 0 };

    // 0. Actualizar la última conexión del monitor / agente emisor
    try {
      await this.db("agents")
        .where("id", agentId)
        .update({
          last_seen: new Date(),
          status: "active",
        });
    } catch { /* continuar si el agente fue eliminado */ }

    const mappedReadings: MappedReading[] = [];

    const parseCount = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      return isNaN(n) ? null : n;
    };

    const parseToner = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      if (isNaN(n)) return null;
      return Math.min(100, Math.max(0, n));
    };

    // Identidad de dispositivo por cliente (§2.4): se resuelve una sola vez por
    // lote, no por lectura — un agente sin client_id (huérfano) no puede
    // identificar nada por esta vía nueva y cae al comportamiento anterior
    // (deviceId por agente) sólo para no romper la ingesta; en la práctica
    // todo agente activo tiene client_id.
    // Fase 7 del gap analysis vs HP SDS: `device_approval_required` viaja en
    // el mismo join — en la práctica `registerDevices()` ya crea la fila
    // primero (ver ahí el mismo gate), pero un agente sin el paso de
    // discovery previo (o una carrera entre los dos) puede llegar acá siendo
    // el primero en crearla.
    const agentRow = await this.db("agents")
      .leftJoin("clients", "agents.client_id", "clients.id")
      .where("agents.id", agentId)
      .select("agents.client_id", "clients.device_approval_required")
      .first();
    const clientId: string | null = agentRow?.client_id ?? null;
    const approvalRequired = agentRow?.device_approval_required ?? false;

    // Auditoría de capacidad (200+ clientes, 23/08/2026): antes este loop era
    // estrictamente secuencial, manteniendo una conexión del pool ocupada
    // todo el tiempo que durara procesar el lote completo. Se paraleliza con
    // un techo de concurrencia (`processReading` no cambia NADA de la lógica
    // de negocio por dispositivo, sólo se ejecuta con varios workers en vez
    // de uno).
    //
    // Advertencia de concurrencia deliberada: se agrupa por identidad CRUDA
    // (`device_id`/`ip` tal como los manda el agente) para que dos lecturas
    // del MISMO dispositivo dentro de un mismo lote se sigan procesando en
    // orden estricto entre sí (evita un lost-update si ambas leen el estado
    // viejo del dispositivo antes de que la otra escriba) — grupos
    // DISTINTOS corren en paralelo. Esto cubre el caso realista (un agente
    // nunca manda dos lecturas de la misma impresora en un mismo ciclo); NO
    // cubre el caso extremo de que dos identidades crudas *distintas*
    // terminen resolviendo al mismo `device_id` ya existente en la resolución
    // de identidad — ese caso ya era una ventana de carrera preexistente
    // entre agentes concurrentes distintos (el UPDATE del dispositivo corre
    // fuera del advisory lock, que sólo protege la resolución de identidad
    // en sí), no algo que este cambio introduzca nuevo.
    const READING_CONCURRENCY = 5;
    const groups = new Map<string, IncomingReading[]>();
    for (const r of readings) {
      const rawKey = (r.device_id || r.ip || "").trim().toLowerCase() || `__no-identity-${groups.size}`;
      const group = groups.get(rawKey);
      if (group) group.push(r); else groups.set(rawKey, [r]);
    }

    const processReading = async (r: IncomingReading): Promise<MappedReading | null> => {
      try {
        const rawDeviceId = (r.device_id || "").trim();
        const ip = (r.ip || "").trim();
        const isIpAsSerial = !rawDeviceId || (net.isIP(rawDeviceId) !== 0) || rawDeviceId === ip;

        let serialToUse: string | null = isIpAsSerial ? null : rawDeviceId;

        // 1. Encontrar el equipo destino por identidad de CLIENTE (serial -> mac
        //    -> ip), no por agente. Reemplaza el matcher histórico `agent_id AND
        //    (ip OR serial)`, que hacía de la IP una identidad de facto (ver
        //    deviceIdentity.ts para el detalle y el bug de DHCP reciclado que esto
        //    corrige). Envuelto en una transacción propia: resolveDeviceIdentity
        //    toma un advisory lock para serializar agentes concurrentes del mismo
        //    cliente sobre la misma impresora.
        let existingDevice: any = null;
        if (clientId && (ip || serialToUse)) {
          existingDevice = await this.db.transaction((trx) =>
            resolveDeviceIdentity(trx, { clientId, agentId, serial: serialToUse, mac: r.mac ?? null, ip })
          ).then((res) => res.device);
        } else if (ip || serialToUse) {
          // Fallback defensivo: agente sin client_id resuelto (huérfano). No
          // debería ocurrir en producción, pero no puede tumbar la ingesta.
          existingDevice = await this.db("devices")
            .where({ agent_id: agentId })
            .whereNull("merged_into")
            .andWhere((builder) => {
              if (ip) builder.where("ip_address", ip);
              if (serialToUse) builder.orWhere("serial_number", serialToUse);
            })
            .first();
        }

        // 2. Limpiar marca si viene genérica
        let brand = r.brand || "unknown";
        if (brand.toLowerCase() === 'generic' && r.model) {
          if (r.model.toLowerCase().includes('samsung')) brand = 'Samsung';
          else if (r.model.toLowerCase().includes('lexmark')) brand = 'Lexmark';
          else if (r.model.toLowerCase().includes('hp')) brand = 'HP';
          else if (r.model.toLowerCase().includes('ricoh')) brand = 'Ricoh';
          else if (r.model.toLowerCase().includes('brother')) brand = 'Brother';
          else if (r.model.toLowerCase().includes('xerox')) brand = 'Xerox';
        }

        // ── Fase 5: Estilización Forzada (Backend) ───────────────────────────
        const cleanModel = (r.model || "unknown").split(/[;|\r\n]/)[0].trim();
        const rawSerial = serialToUse;

        // Hostname válido solo si no es igual al serie ni a la IP
        const validHost = (r.hostname && r.hostname.trim() && r.hostname.trim().toLowerCase() !== rawSerial?.toLowerCase() && r.hostname.trim() !== ip)
          ? r.hostname.trim()
          : null;

        const sourceName = (r.name && r.name !== rawSerial && r.name !== ip) ? r.name : cleanModel;
        let friendlyName = sourceName.split(/[;|\r\n]/)[0].trim();

        const bLower = brand.toLowerCase();
        if (friendlyName.toLowerCase().startsWith(bLower)) {
          friendlyName = friendlyName.slice(bLower.length).trim();
        }

        if (friendlyName.length < 2 || friendlyName === rawSerial) friendlyName = cleanModel;
        const pollMethod = (r.poll_method || 'snmp').slice(0, 20);

        let deviceId: string;

        if (existingDevice) {
          deviceId = existingDevice.id;

          // Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular.
          // `disabled`: no se pierde la señal de "sigue vivo" (last_seen/ip),
          // pero no se tocan contadores/tóner/EWS ni se inserta la lectura en
          // `readings` — es la definición de "dejar de monitorear" (distinto
          // de `decommissioned_at`, que además marca el equipo como retirado
          // y resuelve sus alertas). `supplies_only`/`reports_only` NO cortan
          // acá: la lectura se procesa entera y se inserta en `readings`
          // (lossless, criterio R1) — la diferencia la hacen el guard de
          // `alertService.openAlert` (alertable) y `reportService.ts`
          // (billable) sobre el `monitor_state` ya persistido.
          if (existingDevice.monitor_state === "disabled") {
            await this.db("devices").where("id", deviceId).update({
              ip_address: ip || existingDevice.ip_address,
              last_seen: new Date(),
              active: true,
            });
            return null;
          }

          // Fase 7 del gap analysis vs HP SDS. `ignored`: mismo camino que
          // `disabled` — es una decisión humana explícita de "esto no es un
          // activo mío", corta la ingesta igual. `pending` NO cae acá: sigue
          // procesando la lectura entera (lossless, R1) — sólo queda afuera
          // de `onlyLiveDevices` (inventario/alertas/facturación) hasta que
          // un operador lo registre.
          if (existingDevice.registration_state === "ignored") {
            await this.db("devices").where("id", deviceId).update({
              ip_address: ip || existingDevice.ip_address,
              last_seen: new Date(),
              active: true,
            });
            return null;
          }

          // Conservar número de serie real si ya existía uno registrado
          const finalSerial = (existingDevice.serial_number && existingDevice.serial_number !== ip)
            ? existingDevice.serial_number
            : (serialToUse || existingDevice.serial_number || null);

          // Conservar modelo detallado más largo (para evitar degradaciones a 'hp' o 'generic')
          const existingModel = existingDevice.model || "";
          const NOISE_MODEL = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;
          const isGenericModel = NOISE_MODEL.test(cleanModel);
          const existingIsNoise = NOISE_MODEL.test(existingModel);
          // Un modelo comercial nuevo reemplaza ruido (tarjeta JetDirect, "XXX Series") aunque sea más corto.
          const finalModel = (!isGenericModel && (existingIsNoise || cleanModel.length >= existingModel.length)) ? cleanModel : (existingModel || cleanModel);

          // Conservar nombre amigable si ya está bien formateado. Lee
          // `name_reported` (lo último que reportó la ingesta), NO el `name`
          // efectivo (columna generada COALESCE(name_override, name_reported)):
          // si el operador puso un override manual, `existingDevice.name` nunca
          // es "genérico" y este heurístico dejaría a `name_reported` clavado
          // para siempre en el valor previo a la edición manual, en vez de
          // seguir reflejando lo que el equipo realmente reporta.
          const existingName = existingDevice.name_reported || "";
          const isGenericOrModelName = !existingName || existingName === finalSerial || existingName.includes("192.168") || existingName.toLowerCase() === finalModel.toLowerCase();
          const finalName = validHost || (isGenericOrModelName ? cleanModel : existingName);

          // Detección de reset/decremento de contador: comparar contra el valor
          // previo (no contra los extremos del período — eso lo corrige el cálculo
          // de volumen mensual). Un reset de firmware o reemplazo de placa
          // formateadora hace que el contador físico baje sin que cambie el serial.
          const newTotal = parseCount(r.total_pages);
          const newMono = parseCount(r.mono_pages);
          const newColor = parseCount(r.color_pages);
          const counterResets: string[] = [];
          let resetValue: number | null = null;
          if (newTotal !== null && existingDevice.total_pages !== null && newTotal < existingDevice.total_pages) {
            counterResets.push(`total: ${existingDevice.total_pages} → ${newTotal}`);
            resetValue = newTotal;
          }
          if (newMono !== null && existingDevice.mono_pages !== null && newMono < existingDevice.mono_pages) {
            counterResets.push(`mono: ${existingDevice.mono_pages} → ${newMono}`);
            resetValue = resetValue ?? newMono;
          }
          if (newColor !== null && existingDevice.color_pages !== null && newColor < existingDevice.color_pages) {
            counterResets.push(`color: ${existingDevice.color_pages} → ${newColor}`);
            resetValue = resetValue ?? newColor;
          }

          // Fase 10 del gap analysis vs HP SDS — detección de consumible no
          // original. `resolvedOrigin` es null cuando ni el agente ni el jsonb
          // traen señal (nunca se pisa `existingDevice.supply_origin` en ese caso).
          const resolvedOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
          const originChanged = resolvedOrigin !== null && resolvedOrigin !== existingDevice.supply_origin;

          await this.db("devices")
            .where("id", deviceId)
            .update({
              ip_address: ip || existingDevice.ip_address,
              serial_number: finalSerial,
              brand: (brand !== 'unknown' && brand !== 'generic') ? brand : existingDevice.brand,
              model: finalModel,
              name_reported: finalName,
              last_seen: new Date(),
              active: true,
              total_pages: parseCount(r.total_pages) ?? existingDevice.total_pages,
              mono_pages: parseCount(r.mono_pages) ?? existingDevice.mono_pages,
              color_pages: parseCount(r.color_pages) ?? existingDevice.color_pages,
              poll_method: pollMethod || existingDevice.poll_method,
              toner_black: parseToner(r.toner_black) ?? existingDevice.toner_black,
              toner_cyan: parseToner(r.toner_cyan) ?? existingDevice.toner_cyan,
              toner_magenta: parseToner(r.toner_magenta) ?? existingDevice.toner_magenta,
              toner_yellow: parseToner(r.toner_yellow) ?? existingDevice.toner_yellow,
              cartridge_code_black: r.cartridge_code_black ?? existingDevice.cartridge_code_black,
              cartridge_code_cyan: r.cartridge_code_cyan ?? existingDevice.cartridge_code_cyan,
              cartridge_code_magenta: r.cartridge_code_magenta ?? existingDevice.cartridge_code_magenta,
              cartridge_code_yellow: r.cartridge_code_yellow ?? existingDevice.cartridge_code_yellow,
              cartridge_serial_black: r.cartridge_serial_black ?? existingDevice.cartridge_serial_black,
              cartridge_serial_cyan: r.cartridge_serial_cyan ?? existingDevice.cartridge_serial_cyan,
              cartridge_serial_magenta: r.cartridge_serial_magenta ?? existingDevice.cartridge_serial_magenta,
              cartridge_serial_yellow: r.cartridge_serial_yellow ?? existingDevice.cartridge_serial_yellow,
              // Fase 8 del gap analysis vs HP SDS — bug real: estas 12 columnas ya
              // existían (migración 20260521100000/20260520120000) y el payload del
              // agente ya las mandaba (pasa el schema Ajv de agentRoutes.ts), pero
              // nunca se persistían acá ni en el INSERT de más abajo. Quedaban NULL
              // para siempre, así que `remainingPages`/`remainingDays` del tóner
              // (que usan `capacity` como base cuando el equipo no informa
              // `remainingPages` directo) no se podían calcular del lado servidor.
              cartridge_capacity_black: parseCount(r.cartridge_capacity_black) ?? existingDevice.cartridge_capacity_black,
              cartridge_capacity_cyan: parseCount(r.cartridge_capacity_cyan) ?? existingDevice.cartridge_capacity_cyan,
              cartridge_capacity_magenta: parseCount(r.cartridge_capacity_magenta) ?? existingDevice.cartridge_capacity_magenta,
              cartridge_capacity_yellow: parseCount(r.cartridge_capacity_yellow) ?? existingDevice.cartridge_capacity_yellow,
              cartridge_printed_black: parseCount(r.cartridge_printed_black) ?? existingDevice.cartridge_printed_black,
              cartridge_printed_cyan: parseCount(r.cartridge_printed_cyan) ?? existingDevice.cartridge_printed_cyan,
              cartridge_printed_magenta: parseCount(r.cartridge_printed_magenta) ?? existingDevice.cartridge_printed_magenta,
              cartridge_printed_yellow: parseCount(r.cartridge_printed_yellow) ?? existingDevice.cartridge_printed_yellow,
              cartridge_estimated_black: parseCount(r.cartridge_estimated_black) ?? existingDevice.cartridge_estimated_black,
              cartridge_estimated_cyan: parseCount(r.cartridge_estimated_cyan) ?? existingDevice.cartridge_estimated_cyan,
              cartridge_estimated_magenta: parseCount(r.cartridge_estimated_magenta) ?? existingDevice.cartridge_estimated_magenta,
              cartridge_estimated_yellow: parseCount(r.cartridge_estimated_yellow) ?? existingDevice.cartridge_estimated_yellow,
              // Fase 10 del gap analysis vs HP SDS.
              supply_origin: resolvedOrigin ?? existingDevice.supply_origin,
              supply_origin_at: originChanged ? new Date() : existingDevice.supply_origin_at,
              asset_number_reported: assetNumberFrom(r.supplies_details) ?? existingDevice.asset_number_reported,
              firmware: (r.firmware && r.firmware.trim()) ? r.firmware.trim() : (existingDevice.firmware || null),
              mac: (r.mac && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(r.mac)) ? r.mac : (existingDevice.mac || null),
              hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : (existingDevice.hostname || null),
              location_reported: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : (existingDevice.location_reported || null),
              sku: skuFrom(r.supplies_details) ?? existingDevice.sku ?? null,
              supplies_details: r.supplies_details
                ? JSON.stringify(mergeSuppliesDetails(
                    existingDevice.supplies_details ? (typeof existingDevice.supplies_details === 'string' ? JSON.parse(existingDevice.supplies_details) : existingDevice.supplies_details) : {},
                    r.supplies_details,
                  ))
                : existingDevice.supplies_details,
            });

          if (counterResets.length > 0) {
            // Alerta de EVENTO, no de estado: dedupe por (device_id,type) — antes
            // era por mensaje exacto, que incluye los valores del contador, así que
            // un segundo reset con valores distintos nunca deduplicaba y las filas
            // se acumulaban sin límite. Con la dedupe por tipo, un segundo reset
            // mientras el primero sigue abierto queda suprimido a propósito (ya se
            // avisó; no hace falta una segunda fila) — sólo `PUT /alerts/:id` la
            // cierra, no hay condición de "esto ya no pasa" que la auto-resuelva.
            const resetMsg = `Contador(es) con reset o decremento detectado: ${counterResets.join(', ')}`;
            await alertService.openAlert(this.db, {
              deviceId,
              type: "counter_reset",
              severity: "critical",
              message: resetMsg,
              value: resetValue,
            });
          }

          // Fase 10 del gap analysis vs HP SDS — alerta de ESTADO (como los
          // toner_*_low), no de evento: se abre al transicionar a no-original y
          // se resuelve sola si vuelve a genuine (o si el equipo se reemplaza
          // el cartucho por uno original). Nunca se abre/cierra por un
          // `resolvedOrigin` null (sin señal no es lo mismo que "es original").
          if (originChanged && resolvedOrigin === "non_genuine") {
            await alertService.openAlert(this.db, {
              deviceId,
              type: "supply_non_genuine",
              severity: "warning",
              message: "Se detectó un consumible no original instalado",
              value: null,
            });
          } else if (originChanged && resolvedOrigin === "genuine") {
            await alertService.resolveAlert(this.db, { deviceId, type: "supply_non_genuine" });
          }
        } else {
          deviceId = crypto.randomUUID();
          const newDeviceOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
          await this.db("devices").insert({
            id: deviceId,
            agent_id: agentId,
            client_id: clientId,
            ip_address: ip || null,
            serial_number: serialToUse || null,
            name_reported: (validHost || friendlyName).slice(0, 255),
            brand: brand.slice(0, 100),
            model: cleanModel.slice(0, 255),
            active: true,
            last_seen: new Date(),
            // Fase 7 del gap analysis vs HP SDS.
            registration_state: approvalRequired ? "pending" : "registered",
            total_pages: parseCount(r.total_pages),
            mono_pages: parseCount(r.mono_pages),
            color_pages: parseCount(r.color_pages),
            poll_method: pollMethod,
            toner_black: parseToner(r.toner_black),
            toner_cyan: parseToner(r.toner_cyan),
            toner_magenta: parseToner(r.toner_magenta),
            toner_yellow: parseToner(r.toner_yellow),
            cartridge_code_black: r.cartridge_code_black ?? null,
            cartridge_code_cyan: r.cartridge_code_cyan ?? null,
            cartridge_code_magenta: r.cartridge_code_magenta ?? null,
            cartridge_code_yellow: r.cartridge_code_yellow ?? null,
            cartridge_serial_black: r.cartridge_serial_black ?? null,
            cartridge_serial_cyan: r.cartridge_serial_cyan ?? null,
            cartridge_serial_magenta: r.cartridge_serial_magenta ?? null,
            cartridge_serial_yellow: r.cartridge_serial_yellow ?? null,
            // Fase 8 del gap analysis vs HP SDS — mismo fix que en el UPDATE de arriba.
            cartridge_capacity_black: parseCount(r.cartridge_capacity_black),
            cartridge_capacity_cyan: parseCount(r.cartridge_capacity_cyan),
            cartridge_capacity_magenta: parseCount(r.cartridge_capacity_magenta),
            cartridge_capacity_yellow: parseCount(r.cartridge_capacity_yellow),
            cartridge_printed_black: parseCount(r.cartridge_printed_black),
            cartridge_printed_cyan: parseCount(r.cartridge_printed_cyan),
            cartridge_printed_magenta: parseCount(r.cartridge_printed_magenta),
            cartridge_printed_yellow: parseCount(r.cartridge_printed_yellow),
            cartridge_estimated_black: parseCount(r.cartridge_estimated_black),
            cartridge_estimated_cyan: parseCount(r.cartridge_estimated_cyan),
            cartridge_estimated_magenta: parseCount(r.cartridge_estimated_magenta),
            cartridge_estimated_yellow: parseCount(r.cartridge_estimated_yellow),
            // Fase 10 del gap analysis vs HP SDS.
            supply_origin: newDeviceOrigin,
            supply_origin_at: newDeviceOrigin ? new Date() : null,
            asset_number_reported: assetNumberFrom(r.supplies_details),
            firmware: r.firmware ?? null,
            mac: (r.mac && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(r.mac)) ? r.mac : null,
            hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : null,
            location_reported: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : null,
            sku: skuFrom(r.supplies_details),
            supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
          });

          // Fase 10 del gap analysis vs HP SDS — un equipo recién descubierto
          // cuya primera lectura ya trae un cartucho no original también alerta.
          if (newDeviceOrigin === "non_genuine") {
            await alertService.openAlert(this.db, {
              deviceId,
              type: "supply_non_genuine",
              severity: "warning",
              message: "Se detectó un consumible no original instalado",
              value: null,
            });
          }
        }

        // El matcher nunca revive una baja: sigue guardando lecturas y contadores,
        // pero deja `decommissioned_at` intacto. Se avisa en vez de reactivar en
        // silencio, para que un operador decida entre reactivar o retirar el
        // equipo de la red de verdad.
        if (existingDevice?.decommissioned_at) {
          await alertService.openAlert(this.db, {
            deviceId,
            type: "device_still_reporting",
            severity: "warning",
            message: "Equipo dado de baja pero sigue reportando lecturas",
          });
        }

        // Sincronizar alertas activas provenientes de EWS si están presentes. Dedupe
        // por `type` (antes era por mensaje exacto, y nunca se resolvían solas); acá
        // además se resuelve cualquier alerta EWS previamente abierta de este
        // dispositivo que ya no aparezca en la lista actual — es la primera vez que
        // las alertas EWS tienen un camino de auto-resolución.
        const suppliesObj = typeof r.supplies_details === 'string' ? JSON.parse(r.supplies_details) : r.supplies_details;
        if (suppliesObj?.alerts && Array.isArray(suppliesObj.alerts)) {
          const currentTypes: string[] = [];
          for (const alertItem of suppliesObj.alerts) {
            if (alertItem.description || alertItem.code) {
              const alertMsg = alertItem.description || alertItem.code;
              const alertType = alertService.synthesizeEwsAlertType(alertItem.code, alertMsg);
              const sevLower = String(alertItem.severity || '').toLowerCase();
              const alertSev = (sevLower === 'critical' || sevLower === 'error' || sevLower === 'danger') ? 'critical' : 'warning';

              currentTypes.push(alertType);
              await alertService.openAlert(this.db, {
                deviceId,
                type: alertType,
                severity: alertSev,
                message: alertMsg,
                origin: "device",
              });
            }
          }
          await alertService.resolveStaleDeviceAlerts(this.db, { deviceId, currentTypes });
        }

        // Consolidar cualquier otro registro fantasma duplicado en esta IP, vía la
        // primitiva única de fusión (deja lápida en vez de DELETE — antes esto
        // borraba `alerts` por CASCADE sin reapuntarlas primero, y nunca tocaba
        // `report_closure_lines`).
        if (ip) {
          const ghostDeviceIds: string[] = await this.db("devices")
            .where({ agent_id: agentId, ip_address: ip })
            .whereNot("id", deviceId)
            .whereNull("merged_into")
            .andWhere((b) => b.whereNull("serial_number").orWhere("serial_number", ip))
            .pluck("id");

          for (const ghostId of ghostDeviceIds) {
            try {
              await mergeDevices(this.db, {
                targetId: deviceId,
                sourceId: ghostId,
                reason: "ghost_ip",
                actor: "ingest",
                onOverlap: "keep_target",
              });
            } catch (mergeErr: unknown) {
              // No debe tumbar la ingesta de la lectura actual — un fantasma sin
              // fusionar simplemente queda para revisión manual en /devices/duplicates.
              logger.error({ err: mergeErr }, `[SYNC] No se pudo fusionar fantasma ${ghostId} -> ${deviceId}`);
            }
          }
        }

        // Parseo seguro de fecha (detectar DD/MM/YYYY — agentes viejos, pre-ISO)
        let readingTime: Date;
        const rawTime = r.time || "";
        const parsedNaive = parseNaiveLocalTimestamp(String(rawTime), timezone);

        if (parsedNaive) {
          readingTime = parsedNaive;
        } else {
          readingTime = new Date(rawTime);
        }

        if (isNaN(readingTime.getTime())) {
          readingTime = new Date();
        }

        return {
          reading_id:   isValidUuid(r.reading_id) ? r.reading_id : null,
          time:         readingTime,
          device_id:    deviceId,
          total_pages:  parseCount(r.total_pages),
          mono_pages:   parseCount(r.mono_pages),
          color_pages:  parseCount(r.color_pages),
          toner_black:  parseToner(r.toner_black),
          toner_cyan:   parseToner(r.toner_cyan),
          toner_magenta: parseToner(r.toner_magenta),
          toner_yellow: parseToner(r.toner_yellow),
          supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
          offline:      r.offline ?? false,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.stack || err.message : String(err);
        logger.error({ err: errMsg }, `[SYNC] Error procesando dispositivo ${r.device_id}`);
        // Continuamos con el resto de la tanda para no bloquear todo el agente
        if (agentId) {
          await this.ingestLogs(agentId, [{
            time: new Date().toISOString(),
            level: 'ERROR',
            message: `Device Sync Fail [${r.ip || r.device_id}]: ${errMsg}`
          }], timezone);
        }
        return null;
      }
    };

    // Cada grupo (misma identidad cruda) se procesa en orden estricto puertas
    // adentro; grupos distintos corren con el techo de concurrencia de arriba.
    const groupResults = await mapWithConcurrency(
      Array.from(groups.values()),
      READING_CONCURRENCY,
      async (group) => {
        const out: MappedReading[] = [];
        for (const r of group) {
          const mapped = await processReading(r);
          if (mapped) out.push(mapped);
        }
        return out;
      }
    );
    mappedReadings.push(...groupResults.flat());

    let inserted = 0;
    let duplicates = 0;
    // Filas REALMENTE insertadas (no duplicados de reintento) — usadas para el
    // webhook de "reading.created" de la API pública (`publicWebhookWorker.ts`).
    // Ojo: nunca usar `mappedReadings` crudo para esto, notificaría lecturas que
    // el ON CONFLICT descartó silenciosamente.
    let newlyInsertedReadings: Array<{ device_id: string; time: Date; total_pages: number | null; mono_pages: number | null; color_pages: number | null }> = [];

    if (mappedReadings.length > 0) {
      try {
        // Filtrar lecturas para asegurar que el device_id exista en la tabla devices
        const deviceIds = [...new Set(mappedReadings.map(m => m.device_id))];
        const existingDevices = await this.db("devices")
          .whereIn("id", deviceIds)
          .pluck("id");

        const validDeviceSet = new Set(existingDevices.map(String));
        const validReadings = mappedReadings.filter(m => validDeviceSet.has(String(m.device_id)));

        if (validReadings.length > 0) {
          // Inserción masiva de lecturas válidas en el historial.
          // ON CONFLICT (reading_id, time) DO NOTHING: idempotencia ante reintentos
          // del agente (mismo lote reenviado tras perder la respuesta del servidor).
          const insertedRows = await this.db("readings")
            .insert(validReadings)
            .onConflict(["reading_id", "time"])
            .ignore()
            .returning(["reading_id", "device_id", "time", "total_pages", "mono_pages", "color_pages"]);
          inserted = insertedRows.length;
          duplicates = validReadings.length - inserted;
          newlyInsertedReadings = insertedRows;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg }, "[SYNC] Error al insertar lecturas");
        await this.ingestLogs(agentId, [{
          time: new Date().toISOString(),
          level: 'ERROR',
          message: `Readings Insert Error: ${errMsg}`
        }], timezone);
        throw err;
      }
    }

    // Encolar evaluación de alertas de forma asíncrona
    try {
      const readingsQueue = new Queue("readings-queue", { connection: this.redis as any });
      await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
    } catch (e: unknown) {
      logger.error({ err: e }, "[SYNC] BullMQ no disponible");
    }

    // Webhook "reading.created" de la API pública — un job por BATCH de sync
    // (no uno por lectura individual, evitaría saturar de POSTs a un ERP), con
    // las filas REALMENTE insertadas (no `mappedReadings` crudo).
    if (newlyInsertedReadings.length > 0) {
      try {
        const publicReadingsQueue = new Queue("public-api-readings-queue", { connection: this.redis as any });
        await publicReadingsQueue.add("notify-readings", { readings: newlyInsertedReadings });
      } catch (e: unknown) {
        logger.error({ err: e }, "[SYNC] BullMQ (public-api-readings-queue) no disponible");
      }
    }

    // Actualizar también el heartbeat del agente al sincronizar
    await this.heartbeat(agentId);

    return { received: readings.length, inserted, duplicates };
  }
}
