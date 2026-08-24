import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs";
import path from "path";
import type Redis from "ioredis";
import type { PortalUser } from "../../middlewares/authMiddleware";
import type { VersionUpdateBody } from "./shared";

async function agentVersion(fastify: FastifyInstance, redis: Redis) {
  // 1. Intentar leer de Redis
  try {
    const cached = await redis.get("stc:agent_version_metadata");
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    fastify.log.error(`Error al leer versión de Redis: ${err}`);
  }

  // 2. Intentar leer del archivo local persistentemente
  try {
    const localPath = path.join(process.cwd(), "local_settings.json");
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.version && parsed.url) {
        return parsed;
      }
    }
  } catch (err) {
    fastify.log.error(`Error al leer archivo local_settings.json: ${err}`);
  }

  // 3. Fallback a variables de entorno
  return {
    version: process.env.AGENT_VERSION ?? "1.0.0",
    url: process.env.AGENT_DOWNLOAD_URL ?? null,
    hash: process.env.AGENT_HASH ?? null,
  };
}

async function updateAgentVersion(fastify: FastifyInstance, redis: Redis, request: FastifyRequest, reply: FastifyReply) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  if (!user) {
    return reply.status(401).send({ error: "No autenticado" });
  }
  if (user.role !== "admin") {
    return reply.status(403).send({ error: "Se requiere rol admin para modificar la versión del agente." });
  }

  const { version, url, hash } = request.body as VersionUpdateBody;

  if (!version || !url || !hash) {
    return reply.status(400).send({ error: "Campos versión, url y hash son requeridos" });
  }

  const metadata = { version, url, hash };

  // 1. Guardar en Redis
  try {
    await redis.set("stc:agent_version_metadata", JSON.stringify(metadata));
  } catch (err) {
    fastify.log.error(`Error al guardar versión en Redis: ${err}`);
  }

  // 2. Guardar en archivo local
  try {
    const localPath = path.join(process.cwd(), "local_settings.json");
    fs.writeFileSync(localPath, JSON.stringify(metadata, null, 2), "utf-8");
  } catch (err) {
    fastify.log.error(`Error al guardar versión en archivo local: ${err}`);
  }

  return { status: "success", ...metadata };
}

export function createAuthAgentVersionHandlers(fastify: FastifyInstance, redis: Redis) {
  return {
    agentVersion: () => agentVersion(fastify, redis),
    updateAgentVersion: (request: FastifyRequest, reply: FastifyReply) => updateAgentVersion(fastify, redis, request, reply),
  };
}
