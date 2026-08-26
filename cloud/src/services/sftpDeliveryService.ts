import SftpClient from "ssh2-sftp-client";
import { toWireSftpDestination } from "./sftpDestination";
import type { StoredSftpDestination } from "../shared/domain/sftp-destination";

const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Sube el reporte cerrado al SFTP configurado por el cliente (Fase 19 del
 * gap analysis). Conexión nueva por entrega — no hay pool: la entrega es
 * 1x/mes por cliente al cerrar, no vale la pena mantener conexiones SFTP
 * abiertas en el proceso de la API para eso. Nunca loguea host/usuario en
 * el mensaje de error — `throwIfAnyRejected` en `reportDeliveryWorker.ts` sí
 * lo hace, pero a nivel job no por credencial.
 */
export async function uploadReportViaSftp(stored: StoredSftpDestination, filename: string, body: Buffer): Promise<void> {
  const wire = toWireSftpDestination(stored);
  const client = new SftpClient();
  try {
    await client.connect({
      host: wire.host,
      port: wire.port,
      username: wire.username,
      password: wire.password,
      privateKey: wire.privateKey,
      readyTimeout: CONNECT_TIMEOUT_MS,
    });
    const remotePath = wire.remotePath.endsWith("/") ? `${wire.remotePath}${filename}` : `${wire.remotePath}/${filename}`;
    await client.put(body, remotePath);
  } finally {
    // `end()` puede fallar si `connect()` nunca llegó a abrir la sesión —
    // no debe tapar el error real de la conexión/subida de arriba.
    await client.end().catch(() => {});
  }
}
