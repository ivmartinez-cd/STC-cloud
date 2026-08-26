import type { Knex } from "knex";
import type { StoredSftpDestination } from "../../../../../shared/domain/sftp-destination";

/** Única columna dedicada — nunca pasa por `clients.*`/`stripSftpDestination` de `crud.ts`. */
export async function findSftpDestinationRaw(db: Knex, clientId: string): Promise<StoredSftpDestination | null> {
  const row = await db("clients").where({ id: clientId }).select("sftp_destination").first();
  return row?.sftp_destination ?? null;
}

export async function updateSftpDestination(db: Knex, clientId: string, stored: StoredSftpDestination | null): Promise<void> {
  await db("clients").where({ id: clientId }).update({ sftp_destination: stored ? JSON.stringify(stored) : null });
}
