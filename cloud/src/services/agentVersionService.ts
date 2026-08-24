import fs from "fs";
import path from "path";
import Redis from "ioredis";
import { logger } from "../logger";

/**
 * Versión de agente que el cloud PUBLICA (lo que un agente debería tener tras
 * actualizarse) — no confundir con `cloud/src/version.ts` (versión del
 * servidor cloud en sí) ni con `agents.version` (lo que CADA agente reportó
 * en su último heartbeat). Mismo lookup en 3 niveles que ya usa
 * `authController.agentVersion` (Redis cacheado → `local_settings.json` →
 * env) — extraído acá para que `dashboardController.getDashboard` (Fase 6
 * del gap analysis vs HP SDS: panel "versiones de agente") lo reuse sin
 * duplicar la lógica de fallback.
 */
export async function getPublishedAgentVersion(redis: Redis): Promise<string> {
  try {
    const cached = await redis.get("stc:agent_version_metadata");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.version) return parsed.version;
    }
  } catch (err) {
    logger.error({ err }, "[agentVersionService] No se pudo leer versión de Redis");
  }

  try {
    const localPath = path.join(process.cwd(), "local_settings.json");
    if (fs.existsSync(localPath)) {
      const parsed = JSON.parse(fs.readFileSync(localPath, "utf-8"));
      if (parsed?.version) return parsed.version;
    }
  } catch (err) {
    logger.error({ err }, "[agentVersionService] No se pudo leer local_settings.json");
  }

  return process.env.AGENT_VERSION ?? "1.0.0";
}
