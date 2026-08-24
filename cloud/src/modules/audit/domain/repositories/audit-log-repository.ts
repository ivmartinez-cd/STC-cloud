import type { AuditTargetKind } from "../entities/audit-log";

export interface AuditLogFilter {
  fromDate: Date;
  toDate?: Date;
  /** Del query param `action` (CSV) — sólo presente cuando queda al menos un
   * código no vacío tras el split/trim. */
  actionsFilter?: string[];
  /** Del query param `category` (CSV) — resuelto a la lista de acciones que
   * pertenecen a esas categorías vía el catálogo. Si `category` vino pero no
   * matchea ninguna acción conocida, es `['__none__']` (bloquea todo) en vez
   * de "sin filtro" — mismo criterio que el controller original. Se aplica
   * como un segundo `whereIn` independiente del de `actionsFilter` (AND
   * entre ambos si los dos vienen a la vez), no como intersección
   * precalculada — preserva la semántica SQL exacta del original. */
  categoryActionsFilter?: string[];
  clientId?: string;
  targetId?: string;
  userId?: string;
  limit: number;
  offset: number;
}

/** Fila cruda tal como sale del join con devices/agents/clients/users — sin
 * enriquecer todavía con el catálogo de labels/categorías (eso lo hace el
 * caso de uso, es lógica de aplicación, no de acceso a datos). */
export interface RawAuditLogRow {
  id: string;
  createdAt: Date;
  action: string;
  targetId: string | null;
  targetKind: AuditTargetKind | null;
  targetLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  userId: string | null;
  userUsername: string | null;
  ipAddress: string | null;
  metadata: unknown;
}

export interface AuditActionCount {
  action: string;
  count: number;
}

export interface AuditLogRepository {
  findPage(filter: AuditLogFilter): Promise<{ rows: RawAuditLogRow[]; total: number }>;
  countActionsSince(sinceDate: Date): Promise<AuditActionCount[]>;
}
