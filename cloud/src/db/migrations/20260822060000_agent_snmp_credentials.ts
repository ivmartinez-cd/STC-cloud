import type { Knex } from "knex";

/**
 * Lista de credenciales SNMP por agente (§2.3 gap analysis: "SNMPv3 + lista de
 * credenciales"). Una sola columna `jsonb`, NO una tabla aparte: cada secreto
 * se cifra individualmente dentro del array (ver `services/snmpCredentials.ts`
 * y `services/cryptoService.ts`), el resto de los campos (label, username,
 * protocolos) va en claro a propósito — no son secretos en el protocolo
 * SNMPv3 (RFC 3414). Este layout permite reordenar/renombrar/borrar una
 * entrada sin la clave de cifrado, y que la vista enmascarada sobreviva si la
 * clave se pierde.
 *
 * `agents.snmp_community` (v1/v2c, texto plano) NO se toca ni se depreca acá
 * — sigue siendo el fallback legacy para agentes sin actualizar.
 */
export async function up(knex: Knex): Promise<void> {
  const hasCredentials = await knex.schema.hasColumn("agents", "snmp_credentials");
  if (!hasCredentials) {
    await knex.schema.alterTable("agents", (t) => {
      t.jsonb("snmp_credentials").nullable();
      // Optimistic lock: no por una race de escritura en Postgres (un UPDATE ya
      // es atómico), sino por el caso real de dos pestañas del portal abiertas
      // pisándose la lista entre sí.
      t.integer("snmp_credentials_rev").notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCredentials = await knex.schema.hasColumn("agents", "snmp_credentials");
  if (hasCredentials) {
    await knex.schema.alterTable("agents", (t) => {
      t.dropColumn("snmp_credentials_rev");
      t.dropColumn("snmp_credentials");
    });
  }
}
