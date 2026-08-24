import type { Knex } from "knex";
import {
  compileIpRangeSpecs, publicIpWarnings, validateIpRangeSpecs, extractHostSpecs, overlappingCredentialWarnings,
  type IpRangeSpecInput, type CompiledRange, type HostSpec,
} from "../ipRangeSpec";
import { DEFAULT_BUSINESS_HOURS, validateBusinessHours, type BusinessHoursConfig } from "../businessHours";
import {
  auditMetadata, buildStored, legacyCommunity, maskCredentials, toWire, validateCredentials,
  type MaskedCredential, type StoredCredential,
} from "../snmpCredentials";
import { logger } from "../../logger";
import type { AgentConfigUpdate, AuditContext } from "./types";

/** Configuración de red/escaneo, ip_ranges y credenciales SNMP de un agente. */
export class AgentConfigService {
  constructor(private db: Knex) {}

  /**
   * Actualiza la configuración de red y escaneo de un agente existente.
   * Solo los campos proporcionados se actualizan; los demás permanecen intactos.
   * @param agentId - UUID del agente a configurar.
   * @param newConfig - Objeto parcial con los campos a modificar.
   */
  async updateConfig(agentId: string, newConfig: AgentConfigUpdate, audit?: AuditContext) {
    const updates: Record<string, unknown> = {};
    let warnings: string[] = [];

    if (newConfig.ip_ranges !== undefined) {
      const validated = validateIpRangeSpecs(newConfig.ip_ranges);
      updates.ip_ranges = JSON.stringify(validated);
      warnings = [...publicIpWarnings(validated), ...overlappingCredentialWarnings(validated)];
    }
    if (newConfig.snmp_community !== undefined) {
      updates.snmp_community = newConfig.snmp_community;
    }
    if (newConfig.scan_interval_minutes !== undefined) {
      updates.scan_interval_minutes = newConfig.scan_interval_minutes;
    }
    if (newConfig.name !== undefined) {
      updates.name = newConfig.name;
    }
    if (newConfig.toner_warning_threshold !== undefined) {
      updates.toner_warning_threshold = newConfig.toner_warning_threshold;
    }
    if (newConfig.toner_critical_threshold !== undefined) {
      updates.toner_critical_threshold = newConfig.toner_critical_threshold;
    }
    if (newConfig.business_hours !== undefined) {
      // `null` explícito = reset al default hardcodeado (queda SQL NULL en
      // la columna, no el string "null") — distinto de `undefined` (no
      // tocar este campo), mismo criterio que `ip_ranges`/`snmp_credentials`.
      const validated = validateBusinessHours(newConfig.business_hours);
      updates.business_hours = validated ? JSON.stringify(validated) : null;
    }

    if (Object.keys(updates).length > 0) {
      await this.db("agents").where({ id: agentId }).update(updates);
    }

    await this.db("audit_logs").insert({
      action: "UPDATE_CONFIG",
      target_id: agentId,
      user_id: audit?.userId ?? null,
      ip_address: audit?.ip ?? null,
      // Redactado: `newConfig` incluía `snmp_community` en claro (única
      // credencial de la LAN del cliente) directo en audit_logs. Se guardan
      // los nombres de campo tocados, nunca los valores sensibles.
      metadata: JSON.stringify({ fields: Object.keys(updates) }),
    });

    return { status: "success", warnings };
  }

  async getConfig(agentId: string) {
    const agent = await this.db("agents")
      .where({ id: agentId })
      .select(
        "ip_ranges", "snmp_community", "scan_interval_minutes", "toner_warning_threshold",
        "toner_critical_threshold", "snmp_credentials", "business_hours"
      )
      .first();

    if (agent) {
      const rawSpecs: IpRangeSpecInput[] =
        (typeof agent.ip_ranges === 'string' ? JSON.parse(agent.ip_ranges) : agent.ip_ranges) ?? [];

      const storedCredentials: StoredCredential[] =
        (typeof agent.snmp_credentials === 'string' ? JSON.parse(agent.snmp_credentials) : agent.snmp_credentials) ?? [];
      const liveCredentialIds = new Set(storedCredentials.map((c) => c.id));

      // El agente NUNCA ve CIDR/exclusiones/hostname sin resolver — sólo
      // esto (el path del heartbeat) compila a pares planos {start,end}. El
      // resto de los callers (portal) usan `getIpRangeSpecsRaw()` para ver
      // el spec tal cual el admin lo escribió.
      const compiledRanges: CompiledRange[] = compileIpRangeSpecs(rawSpecs);
      // Fail-open: si `credential_ids` de un rango ya no matchea NINGÚN id
      // vivo (colgante total o parcial — mismo criterio para ambos), se
      // manda el campo AUSENTE (el agente prueba el pool completo) en vez de
      // una lista vacía que dejaría ese rango sin ninguna credencial
      // utilizable. Sólo se puede resolver ACÁ porque es el único lugar con
      // ambos datos (rangos + credenciales) cargados a la vez — `ip_ranges`
      // y `agents.snmp_credentials` se editan por endpoints separados, sin
      // transacción compartida (ver `replaceSnmpCredentials` para el aviso
      // en sentido contrario: borrar una credencial que un rango referencia).
      agent.ip_ranges = compiledRanges.map((r) => {
        if (!r.credential_ids) return r;
        const live = r.credential_ids.filter((id) => liveCredentialIds.has(id));
        return live.length > 0 ? { ...r, credential_ids: live } : { start: r.start, end: r.end };
      });

      // `ip_hosts`: campo de heartbeat NUEVO y ADITIVO — agentes viejos que
      // nunca lo vieron lo ignoran. El agente resuelve cada hostname él
      // mismo en cada ciclo de discovery (DNS interno del cliente, el cloud
      // no tiene visibilidad). Mismo fail-open de `credential_ids` que arriba.
      const hostSpecs: HostSpec[] = extractHostSpecs(rawSpecs).map((h) => {
        if (!h.credential_ids) return h;
        const live = h.credential_ids.filter((id) => liveCredentialIds.has(id));
        return live.length > 0 ? { ...h, credential_ids: live } : { hostname: h.hostname, label: h.label };
      });
      if (hostSpecs.length > 0) agent.ip_hosts = hostSpecs;

      // `business_hours` se resuelve al default ACÁ, antes de salir en el
      // payload — el wire nunca lleva `null` crudo, sólo `undefined` (campo
      // no soportado por versiones viejas de este método) o un objeto
      // concreto. Esto preserva sin ambigüedad el guard `!== undefined` que
      // usa `HeartbeatService.handleRemoteConfig()` del lado agente.
      const storedBusinessHours: BusinessHoursConfig | null =
        (typeof agent.business_hours === 'string' ? JSON.parse(agent.business_hours) : agent.business_hours) ?? null;
      agent.business_hours = storedBusinessHours ?? DEFAULT_BUSINESS_HOURS;

      // `snmp_community` legacy SIEMPRE viaja (agentes sin actualizar sólo
      // entienden este campo) — se deriva de la lista si hay alguna entrada
      // v1/v2c, si no cae a la columna vieja.
      agent.snmp_community = legacyCommunity(storedCredentials, agent.snmp_community ?? null);
      delete agent.snmp_credentials;

      // El heartbeat NUNCA puede fallar por esto: si el descifrado revienta
      // (clave ausente/rotada/corrupta), se omite el campo del payload en vez
      // de propagar — un 500 acá rompería scan/logs/comandos de TODOS los
      // agentes por un problema de una sola columna de un solo agente.
      try {
        const wire = toWire(storedCredentials);
        if (wire.length > 0) agent.snmp_credentials = wire;
      } catch (err) {
        logger.error({ err }, `[AGENT_SERVICE] No se pudo armar snmp_credentials para el heartbeat de ${agentId}`);
      }

      // `device_policies`: campo de heartbeat NUEVO y ADITIVO (mismo criterio
      // que `ip_hosts` arriba) — Fase 5 del gap analysis vs HP SDS, extendido
      // en la Fase 7 con `ignored`. Sólo los equipos con `monitor_state <>
      // 'full'` O `registration_state = 'ignored'` (el caso común, "todo
      // habilitado y registrado", no necesita viajar). `ignored` pisa el
      // estado efectivo (si un equipo está ignorado, no importa su
      // monitor_state — el agente no debería ni sondearlo). El cloud sigue
      // siendo la única autoridad real (el guard vive en
      // `alertService.openAlert` y `agentService.syncReadings`) — esto es
      // sólo para que un agente actualizado (Fase 10) deje de sondear lo que
      // el cloud ya va a descartar. Tope de 500 para no inflar el heartbeat
      // de una flota enorme con casos excepcionales.
      const devicePolicies = await this.db("devices")
        .where({ agent_id: agentId })
        .where((b) => b.whereNot("monitor_state", "full").orWhere("registration_state", "ignored"))
        .whereNull("merged_into")
        .select("ip_address", "monitor_state", "registration_state")
        .limit(500);
      if (devicePolicies.length > 0) {
        agent.device_policies = devicePolicies
          .filter((d: { ip_address: string | null }) => d.ip_address)
          .map((d: { ip_address: string; monitor_state: string; registration_state: string }) => ({
            ip: d.ip_address,
            state: d.registration_state === "ignored" ? "ignored" : d.monitor_state,
          }));
      }
    }
    return agent;
  }

  /**
   * Specs de `ip_ranges` SIN compilar (CIDR/exclusiones tal cual se
   * guardaron) — para que el portal muestre lo que el admin realmente
   * escribió, no una lista fragmentada de sub-rangos. `getConfig()` ya
   * devuelve la versión compilada (para el heartbeat); esta es la query
   * separada que el handler portal usa para pisar ese campo de vuelta,
   * mismo patrón que `getSnmpCredentialsMasked()`.
   */
  async getIpRangeSpecsRaw(agentId: string): Promise<IpRangeSpecInput[] | null> {
    const agent = await this.db("agents").where({ id: agentId }).select("ip_ranges").first();
    if (!agent) return null;
    return (typeof agent.ip_ranges === 'string' ? JSON.parse(agent.ip_ranges) : agent.ip_ranges) ?? [];
  }

  /** Vista enmascarada para el portal — nunca material de clave. `rev` para optimistic locking. */
  async getSnmpCredentialsMasked(agentId: string): Promise<{ credentials: MaskedCredential[]; rev: number } | null> {
    const agent = await this.db("agents").where({ id: agentId }).select("snmp_credentials", "snmp_credentials_rev").first();
    if (!agent) return null;
    const stored: StoredCredential[] =
      (typeof agent.snmp_credentials === 'string' ? JSON.parse(agent.snmp_credentials) : agent.snmp_credentials) ?? [];
    return { credentials: maskCredentials(stored), rev: agent.snmp_credentials_rev ?? 0 };
  }

  /**
   * Reemplaza TODA la lista de credenciales SNMP de un agente. `expected_rev`
   * evita que dos pestañas del portal se pisen (409 si no coincide con el
   * valor actual). Lanza `MissingEncryptionKeyError`/`SnmpCredentialValidationError`
   * — el controller las mapea a 503/400.
   */
  async replaceSnmpCredentials(
    agentId: string,
    body: unknown,
    audit?: AuditContext
  ): Promise<{ status: "success"; count: number; rev: number; warnings: string[] } | { status: "conflict"; rev: number } | null> {
    const bodyObj = (body ?? {}) as { expected_rev?: unknown; credentials?: unknown };
    const current = await this.db("agents").where({ id: agentId }).select("snmp_credentials", "snmp_credentials_rev", "ip_ranges").first();
    if (!current) return null;

    const currentRev = current.snmp_credentials_rev ?? 0;
    if (typeof bodyObj.expected_rev === "number" && bodyObj.expected_rev !== currentRev) {
      return { status: "conflict", rev: currentRev };
    }

    const currentStored: StoredCredential[] =
      (typeof current.snmp_credentials === 'string' ? JSON.parse(current.snmp_credentials) : current.snmp_credentials) ?? [];
    const validated = validateCredentials(bodyObj.credentials);
    const nextStored = buildStored(validated, currentStored);
    const nextRev = currentRev + 1;

    await this.db("agents").where({ id: agentId }).update({
      snmp_credentials: JSON.stringify(nextStored),
      snmp_credentials_rev: nextRev,
    });

    await this.db("audit_logs").insert({
      action: "AGENT_SNMP_CREDENTIALS_UPDATED",
      target_id: agentId,
      user_id: audit?.userId ?? null,
      ip_address: audit?.ip ?? null,
      metadata: JSON.stringify(auditMetadata(nextStored)),
    });

    // Warning no bloqueante: ¿algún rango de ip_ranges referencia una
    // credencial que acaba de desaparecer de la lista? Ese rango cae al
    // fail-open (pool completo) en el próximo heartbeat, ver `getConfig()`
    // — no queda sin ninguna credencial, pero vale avisar en el momento del
    // borrado en vez de que la deriva se descubra en silencio después.
    const nextIds = new Set(nextStored.map((c) => c.id));
    const removedIds = currentStored.map((c) => c.id).filter((id) => !nextIds.has(id));
    const warnings: string[] = [];
    if (removedIds.length > 0) {
      const rawSpecs: IpRangeSpecInput[] =
        (typeof current.ip_ranges === 'string' ? JSON.parse(current.ip_ranges) : current.ip_ranges) ?? [];
      const removedSet = new Set(removedIds);
      const affected = rawSpecs.filter((s) => s.credential_ids?.some((id) => removedSet.has(id)));
      if (affected.length > 0) {
        warnings.push(
          `${affected.length} rango(s) de ip_ranges referencian una credencial que se acaba de eliminar — probarán el pool completo de credenciales en el próximo ciclo.`
        );
      }
    }

    return { status: "success", count: nextStored.length, rev: nextRev, warnings };
  }
}
