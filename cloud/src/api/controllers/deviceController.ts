import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isIpInRanges(ip: string, ranges: { start: string; end: string }[]): boolean {
  const ipInt = ipToInt(ip);
  return ranges.some(r => ipInt >= ipToInt(r.start) && ipInt <= ipToInt(r.end));
}

export function createDeviceController(db: Knex) {
  return {
    listDevices: async () =>
      await db("devices")
        .join("agents", "devices.agent_id", "agents.id")
        .join("clients", "agents.client_id", "clients.id")
        .where("devices.active", true)
        .select(
          "devices.*",
          db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "clients.name as client_name"
        )
        .orderBy("clients.name"),

    getDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const device = await db("devices")
        .where("devices.id", id)
        .select(
          "devices.*",
          db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "clients.name as client_name"
        )
        .join("agents", "agents.id", "devices.agent_id")
        .join("clients", "clients.id", "agents.client_id")
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      return device;
    },

    getDeviceReadings: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const { from, to, limit } = request.query as any;

      const query = db("readings")
        .where({ device_id: id })
        .orderBy("time", "desc")
        .limit(Math.min(Number(limit) || 500, 5000));

      if (from) query.where("time", ">=", new Date(from));
      if (to) query.where("time", "<=", new Date(to));

      return await query.select(
        "*",
        db.raw(
          "CASE WHEN offline = true THEN 'offline' ELSE 'online' END as status"
        )
      );
    },

    ewsProxy: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const subPath = "/" + ((request.params as any)["*"] || "");
      const queryString = request.url.split('?')[1];
      const fullPath = subPath + (queryString ? "?" + queryString : "");

      // 1. Obtener dispositivo e IP
      const device = await db("devices")
        .where("id", id)
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });

      const agentId = device.agent_id;
      const ip = device.ip_address;

      // 2. Verificar si el agente está conectado vía WSS
      const { isAgentOnlineWss, sendCommandToAgent, pendingProxyRequests } = require("../../ws/index");
      if (!isAgentOnlineWss(agentId)) {
        return reply.status(503).send({ error: "El agente de monitoreo está desconectado. No se puede acceder al EWS en este momento." });
      }

      // 3. Validación defensa-en-profundidad: la IP del dispositivo debe estar dentro
      //    de los rangos configurados del agente (previene pivoteo si un admin modifica la IP)
      const agent = await db("agents").where("id", agentId).select("ip_ranges").first();
      if (agent?.ip_ranges) {
        const ranges: { start: string; end: string }[] =
          typeof agent.ip_ranges === "string" ? JSON.parse(agent.ip_ranges) : agent.ip_ranges;
        if (Array.isArray(ranges) && ranges.length > 0 && !isIpInRanges(ip, ranges)) {
          return reply.status(403).send({ error: "La IP del dispositivo no está dentro de los rangos autorizados del agente." });
        }
      }

      // 4. Preparar payload de comando
      const cleanHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        const k = key.toLowerCase();
        if (k !== "host" && k !== "authorization" && k !== "cookie" && k !== "connection") {
          cleanHeaders[key] = String(value);
        }
      }

      const tunnelRequestId = require("crypto").randomUUID();

      // 5. Enviar comando y esperar resolución de promesa
      const resultPromise = new Promise<{ statusCode: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingProxyRequests.delete(tunnelRequestId);
          reject(new Error("Timeout esperando respuesta del agente (15s)"));
        }, 15000);

        pendingProxyRequests.set(tunnelRequestId, { resolve, reject, timeout });
      });

      // Leer body si existe (por ejemplo en POST)
      // Se usa Buffer.isBuffer para preservar datos binarios intactos; JSON solo para objetos ya parseados por Fastify
      let requestBodyBase64: string | null = null;
      if (request.body !== undefined && request.body !== null) {
        let bodyBuf: Buffer;
        if (Buffer.isBuffer(request.body)) {
          bodyBuf = request.body;
        } else if (typeof request.body === "string") {
          bodyBuf = Buffer.from(request.body);
        } else {
          bodyBuf = Buffer.from(JSON.stringify(request.body));
        }
        requestBodyBase64 = bodyBuf.toString("base64");
      }

      const sent = sendCommandToAgent(agentId, "EWS_PROXY_REQ", {
        ip,
        method: request.method,
        path: fullPath,
        headers: cleanHeaders,
        body: requestBodyBase64
      }, tunnelRequestId);

      if (!sent) {
        pendingProxyRequests.delete(tunnelRequestId);
        return reply.status(503).send({ error: "No se pudo transmitir el comando al agente." });
      }

      try {
        const response = await resultPromise;

        // Escribir headers
        for (const [key, value] of Object.entries(response.headers)) {
          const k = key.toLowerCase();
          if (k !== "content-encoding" && k !== "transfer-encoding" && k !== "content-length") {
            if (k === "location") {
              let loc = String(value);
              if (loc.startsWith("/")) {
                loc = `/api/v1/devices/${id}/ews-proxy${loc}`;
              } else if (loc.startsWith("http")) {
                try {
                  const parsedUrl = new URL(loc);
                  loc = `/api/v1/devices/${id}/ews-proxy${parsedUrl.pathname}${parsedUrl.search}`;
                } catch {}
              }
              reply.header(key, loc);
            } else {
              reply.header(key, value);
            }
          }
        }

        reply.code(response.statusCode);

        let responseBody = Buffer.from(response.body, "base64");
        
        // Inyección de <base href> y reescritura de atributos absolutos para evitar fugas del iframe
        const contentType = response.headers["content-type"] || "";
        if (contentType.toLowerCase().includes("text/html")) {
          let html = responseBody.toString("utf8");
          const proxyPrefix = `/api/v1/devices/${id}/ews-proxy/`;
          
          // Reemplazar href="/, src="/, action="/ por prefijo del proxy (evita fuga a localhost:5173/)
          html = html.replace(/(href|src|action)\s*=\s*"\/(?!\/)/gi, `$1="${proxyPrefix}`);
          html = html.replace(/(href|src|action)\s*=\s*'\/(?!\/)/gi, `$1='${proxyPrefix}`);
          
          // Inyección de <base href>
          const baseTag = `<base href="${proxyPrefix}">`;
          const headIndex = html.toLowerCase().indexOf("<head>");
          if (headIndex !== -1) {
            html = html.slice(0, headIndex + 6) + "\n" + baseTag + html.slice(headIndex + 6);
          } else {
            html = baseTag + "\n" + html;
          }
          responseBody = Buffer.from(html, "utf8");
        }

        return reply.send(responseBody);
      } catch (err: any) {
        return reply.status(504).send({ error: err.message });
      }
    }
  };
}
