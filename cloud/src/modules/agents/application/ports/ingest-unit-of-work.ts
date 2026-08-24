import type { IngestDeviceRepository } from "../../domain/repositories/ingest-device-repository";
import type { DeviceIdentityResolver } from "./device-identity";

export interface IngestTransactionScope {
  devices: IngestDeviceRepository;
  /** Resolutor de identidad ligado a la MISMA transacción (el advisory lock se sostiene hasta el commit). */
  identity: DeviceIdentityResolver;
}

/**
 * Unidad de trabajo del registro desde el agente: resolver identidad + insertar/
 * actualizar la fila en UNA transacción, así el `pg_advisory_xact_lock` de la
 * resolución serializa dos registros concurrentes de la misma impresora nueva.
 */
export interface IngestUnitOfWork {
  run<T>(fn: (tx: IngestTransactionScope) => Promise<T>): Promise<T>;
}
