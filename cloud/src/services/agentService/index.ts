/**
 * Punto de entrada del módulo `agentService` (Fase 2 de
 * docs/dev/ARCHITECTURE_MIGRATION_PLAN.md — dividido desde un solo archivo de
 * 1592 líneas). Reexporta todo lo que el archivo original exportaba;
 * ningún import externo cambia.
 */
export { AgentService } from "./agent-service";
export type {
  AuditContext, AgentConfigUpdate, IncomingDevice, IncomingLogEntry, IncomingReading, SystemInfoPayload,
} from "./types";
