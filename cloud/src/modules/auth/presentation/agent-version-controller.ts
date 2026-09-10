import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import type { AgentReleaseRepository } from "../../agents/domain/repositories/agent-release-repository";
import type { VersionUpdateBody } from "../domain/entities/auth-dtos";

const DEFAULT_CHANNEL = "stable";

// El agente manda su propio canal (embebido en build time, ver
// agent/src/core/channel.ts) como query param — un agente viejo que todavía
// no lo manda cae en 'stable', mismo comportamiento que antes de esta fase.
async function agentVersion(releases: AgentReleaseRepository, request: FastifyRequest) {
  const channel = ((request.query as { channel?: string })?.channel || DEFAULT_CHANNEL).trim();
  const release = await releases.getLatest(channel);
  if (!release) {
    return { version: "1.0.0", url: null, hash: null };
  }
  return { version: release.version, url: release.url, hash: release.sha256 };
}

async function updateAgentVersion(releases: AgentReleaseRepository, request: FastifyRequest, reply: FastifyReply) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  if (!user) {
    return reply.status(401).send({ error: "No autenticado" });
  }
  if (user.role !== "admin") {
    return reply.status(403).send({ error: "Se requiere rol admin para modificar la versión del agente." });
  }

  const { version, url, hash, channel, kind } = request.body as VersionUpdateBody;

  if (!version || !url || !hash) {
    return reply.status(400).send({ error: "Campos versión, url y hash son requeridos" });
  }

  const release = await releases.publish({
    version,
    url,
    sha256: hash,
    channel: channel || DEFAULT_CHANNEL,
    kind: kind || (url.toLowerCase().endsWith(".zip") ? "zip" : "bundle"),
    publishedBy: user.username ?? null,
  });

  return { status: "success", version: release.version, url: release.url, hash: release.sha256, channel: release.channel };
}

export function createAuthAgentVersionHandlers(fastify: FastifyInstance, releases: AgentReleaseRepository) {
  return {
    agentVersion: (request: FastifyRequest) => agentVersion(releases, request),
    updateAgentVersion: (request: FastifyRequest, reply: FastifyReply) => updateAgentVersion(releases, request, reply),
  };
}
