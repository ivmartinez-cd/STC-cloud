import type { Knex } from "knex";
import { resolveDeviceIdentity } from "../../../devices";
import type { IngestTransactionScope, IngestUnitOfWork } from "../../application/ports/ingest-unit-of-work";
import type { AgentUnitOfWork } from "../../application/use-cases/portal-agent-use-cases";
import { KnexAgentPortalRepository } from "./knex-agent-portal-repository";
import { KnexAuditLogWriter } from "./knex-audit-log-writer";
import { KnexIngestDeviceRepository } from "./knex-ingest-device-repository";

/** Registro desde el agente: resolutor de identidad y repositorio sobre la MISMA transacción. */
export class KnexIngestUnitOfWork implements IngestUnitOfWork {
  constructor(private readonly db: Knex) {}

  run<T>(fn: (tx: IngestTransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) =>
      fn({
        devices: new KnexIngestDeviceRepository(trx),
        identity: { resolve: async (params) => (await resolveDeviceIdentity(trx, params)).device },
      })
    );
  }
}

/** Borrado en cascada del agente + audit en una transacción. */
export class KnexAgentUnitOfWork implements AgentUnitOfWork {
  constructor(private readonly db: Knex) {}

  run<T>(fn: (tx: { portal: KnexAgentPortalRepository; audit: KnexAuditLogWriter }) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) => fn({ portal: new KnexAgentPortalRepository(trx), audit: new KnexAuditLogWriter(trx) }));
  }
}
