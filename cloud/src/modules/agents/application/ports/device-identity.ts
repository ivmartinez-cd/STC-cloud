/**
 * Puertos hacia `modules/devices`: identidad por cliente (serial → mac → ip)
 * y fusión de fantasmas. Los adapters llaman la fachada de ese módulo.
 */
export interface IdentityLookup {
  clientId: string;
  agentId: string;
  serial: string | null;
  mac: string | null;
  ip: string | null;
}

export interface DeviceIdentityResolver {
  /** Corre en una transacción propia (advisory lock por identidad). Devuelve la fila del equipo o `null`. */
  resolve(params: IdentityLookup): Promise<any | null>;
}

export interface GhostMergeParams {
  targetId: string;
  sourceId: string;
}

export interface DeviceMerger {
  /** Fusión `ghost_ip` desde la ingesta (actor `ingest`, `onOverlap: keep_target`). */
  mergeGhost(params: GhostMergeParams): Promise<void>;
}
