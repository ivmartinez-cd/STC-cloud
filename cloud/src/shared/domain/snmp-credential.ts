/**
 * Tipos de credencial SNMP (shared kernel): el contrato de la columna
 * `agents.snmp_credentials jsonb`, del body del PUT y de lo que viaja al agente.
 * Sólo tipos — la validación, el cifrado y el enmascarado viven en
 * `services/snmpCredentials.ts` (necesitan cryptoService). Están acá para que
 * `modules/agents/domain` pueda tipar sin depender de servicios de infraestructura.
 *
 * `label`, `username` y los protocolos van en claro A PROPÓSITO — `msgUserName`
 * y los protocolos viajan fuera del scopedPDU cifrado en cada PDU SNMPv3 (RFC
 * 3414), no son secretos. Cada secreto se cifra individualmente (`*_enc`).
 */

export type SnmpVersion = "v1" | "v2c" | "v3";
export type SecurityLevel = "noAuthNoPriv" | "authNoPriv" | "authPriv";
export type AuthProtocol = "md5" | "sha" | "sha224" | "sha256" | "sha384" | "sha512";
export type PrivProtocol = "des" | "aes" | "aes256b" | "aes256r";

/** Como se persiste en `agents.snmp_credentials`. */
export interface StoredCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  community_enc?: string;
  username?: string;
  security_level?: SecurityLevel;
  auth_protocol?: AuthProtocol;
  auth_key_enc?: string;
  priv_protocol?: PrivProtocol;
  priv_key_enc?: string;
}

/** Como llega en el body del PUT — una referencia a lo ya guardado, o material nuevo. */
export type CredentialInput =
  | { ref: string }
  | { version: "v1" | "v2c"; label?: string | null; community: string }
  | {
      version: "v3";
      label?: string | null;
      username: string;
      security_level: SecurityLevel;
      auth_protocol?: AuthProtocol;
      auth_key?: string;
      priv_protocol?: PrivProtocol;
      priv_key?: string;
    };

/** Lo que ve el portal — nunca un `*_enc` ni material de clave. */
export interface MaskedCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  username?: string;
  security_level?: SecurityLevel;
  auth_protocol?: AuthProtocol;
  priv_protocol?: PrivProtocol;
  has_community: boolean;
  has_auth_key: boolean;
  has_priv_key: boolean;
}

/** Lo que recibe el agente por heartbeat — descifrado. */
export type WireCredential =
  | { id: string; version: "v1" | "v2c"; community: string }
  | {
      id: string;
      version: "v3";
      username: string;
      security_level: SecurityLevel;
      auth_protocol?: AuthProtocol;
      auth_key?: string;
      priv_protocol?: PrivProtocol;
      priv_key?: string;
    };
