export class MergeError extends Error {}
export class MergeIdentityConflictError extends MergeError {}
export class MergeClientMismatchError extends MergeError {}
export class MergeTooLargeError extends MergeError {
  constructor(public count: number, public max: number) {
    super(`El equipo fuente tiene ${count} lecturas (máximo permitido: ${max}); requiere un merge offline por lotes.`);
  }
}
export class MergeOverlapError extends MergeError {
  constructor(
    public from: Date,
    public to: Date,
    public sourceCount: number,
    public targetCount: number
  ) {
    super(
      `Las series de lecturas se solapan entre ${from.toISOString()} y ${to.toISOString()} ` +
      `(fuente: ${sourceCount}, destino: ${targetCount}) — elegí onOverlap para continuar.`
    );
  }
}

export interface MergeParams {
  targetId: string;
  sourceId: string;
  reason: "ghost_ip" | "ghost_serial_promote" | "dedupe" | "manual";
  actor: "portal" | "ingest";
  userId?: string | null;
  ip?: string | null;
  requestReason?: string | null;
  onOverlap?: "abort" | "keep_target" | "keep_source";
  force?: boolean;
  maxReadings?: number;
}

export interface MergeResult {
  keptId: string;
  mergedId: string;
  readingsMoved: number;
  readingsDeletedOverlap: number;
  alertsMoved: number;
  alertsResolvedCollision: number;
  closureLinesMoved: number;
}

export interface DeviceRow {
  id: string;
  client_id: string | null;
  agent_id: string | null;
  serial_number: string | null;
  mac: string | null;
  ip_address: string | null;
  hostname: string | null;
  location_reported: string | null;
  firmware: string | null;
  sku: string | null;
  brand: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  last_seen: Date | null;
  created_at: Date;
  merged_into: string | null;
}
