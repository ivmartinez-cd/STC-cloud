// Self-join de pares vivos del mismo cliente, por MAC, por IP-fantasma en
// la misma sede, o por serial coincidente entre monitores distintos (el
// caso que motiva la clave por cliente en primer lugar).
//
// `a_brand`/`a_model`/`a_name`/`b_*` y `detected_at` (25/08/2026): el handoff hifi
// "Cliente — detalle" muestra el par como "HP LaserJet M428 ↔ HP LaserJet M428fdw"
// (marca+modelo, no serie cruda) + antigüedad de la coincidencia — columnas nuevas,
// aditivas, no cambian el shape que ya consume `DuplicateDevicesCard.tsx`/
// `MergeDeviceModal.tsx` (siguen usando sólo `a_serial`/`a_ip`/`a_mac`/`reason`).
export const DUPLICATES_SQL = (byAgent: boolean) => `SELECT a.id AS a_id, a.serial_number AS a_serial, a.mac AS a_mac, a.ip_address AS a_ip,
            a.agent_id AS a_agent_id, a.last_seen AS a_last_seen,
            a.brand AS a_brand, a.model AS a_model, a.name AS a_name,
            b.id AS b_id, b.serial_number AS b_serial, b.mac AS b_mac, b.ip_address AS b_ip,
            b.agent_id AS b_agent_id, b.last_seen AS b_last_seen,
            b.brand AS b_brand, b.model AS b_model, b.name AS b_name,
            LEAST(a.created_at, b.created_at) AS detected_at,
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
        ${byAgent ? "AND (a.agent_id = ? OR b.agent_id = ?)" : ""}
      LIMIT 200`;

export function duplicatesBindings(clientId: string, agentId?: string): string[] {
  return agentId ? [clientId, clientId, agentId, agentId] : [clientId, clientId];
}
