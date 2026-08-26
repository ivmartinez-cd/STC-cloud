/**
 * Lista de credenciales SNMP por agente (§2.3 gap analysis: SNMPv3 + lista
 * probada en orden). Espejo del lado cloud (`services/snmpCredentials.ts`) —
 * ver ese archivo para el porqué del layout (secretos individualmente
 * cifrados, resto en claro a propósito).
 */
export type SnmpVersion = 'v1' | 'v2c' | 'v3';
export type SnmpSecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
export type SnmpAuthProtocol = 'md5' | 'sha' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
export type SnmpPrivProtocol = 'des' | 'aes' | 'aes256b' | 'aes256r';

/** Lo que devuelve el backend — nunca un secreto, sólo si está configurado o no. */
export interface MaskedSnmpCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  username?: string;
  security_level?: SnmpSecurityLevel;
  auth_protocol?: SnmpAuthProtocol;
  priv_protocol?: SnmpPrivProtocol;
  has_community: boolean;
  has_auth_key: boolean;
  has_priv_key: boolean;
}

/**
 * Body de `PUT /agents/:id/snmp-credentials` — cada entrada es o bien una
 * referencia a una entrada ya guardada (`ref`, se conserva tal cual, no
 * repite secretos — así reordenar/renombrar/borrar no exige re-tipear
 * contraseñas) o material nuevo a cifrar.
 */
export type SnmpCredentialInput =
  | { ref: string }
  | { version: 'v1' | 'v2c'; label?: string | null; community: string }
  | {
      version: 'v3';
      label?: string | null;
      username: string;
      security_level: SnmpSecurityLevel;
      auth_protocol?: SnmpAuthProtocol;
      auth_key?: string;
      priv_protocol?: SnmpPrivProtocol;
      priv_key?: string;
    };
