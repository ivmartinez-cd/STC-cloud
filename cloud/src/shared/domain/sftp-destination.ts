/**
 * Tipos del destino SFTP por cliente (shared kernel, Fase 19 del gap
 * analysis): el contrato de la columna `clients.sftp_destination jsonb`, del
 * body del PUT, y de la vista enmascarada para el portal. Sólo tipos — la
 * validación, el cifrado y el enmascarado viven en `services/sftpDestination.ts`
 * (necesita `cryptoService`). Mismo criterio que `snmp-credential.ts`: acá
 * para que el dominio pueda tipar sin depender de infraestructura.
 *
 * A diferencia de SNMP (lista de hasta 8 credenciales por agente), acá es UN
 * solo destino por cliente — no hace falta un `id` por entrada ni resolución
 * por `ref`: el PUT siempre reemplaza el objeto entero, o lo borra con `null`.
 */

export type SftpAuthMethod = "password" | "private_key";

/** Como se persiste en `clients.sftp_destination`. */
export interface StoredSftpDestination {
  host: string;
  port: number;
  username: string;
  auth_method: SftpAuthMethod;
  password_enc?: string;
  private_key_enc?: string;
  /** Ruta remota donde se sube el reporte — default `/` si no se especifica. */
  remote_path: string;
  updated_at: string;
}

/** Como llega en el body del PUT — material en claro, nunca `*_enc`. */
export interface SftpDestinationInput {
  host: string;
  port?: number;
  username: string;
  auth_method: SftpAuthMethod;
  password?: string;
  private_key?: string;
  remote_path?: string;
}

/** Lo que ve el portal — nunca `password`/`private_key` ni sus `*_enc`. */
export interface MaskedSftpDestination {
  configured: true;
  host: string;
  port: number;
  username: string;
  auth_method: SftpAuthMethod;
  remote_path: string;
  updated_at: string;
}

/** Lo que usa el worker de entrega para conectar — descifrado, nunca cruza al portal. */
export interface WireSftpDestination {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  remotePath: string;
}
