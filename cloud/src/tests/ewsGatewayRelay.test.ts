// Gateway de EWS navegable — el relay con dobles: el semáforo por sesión, el
// reintento por cambio de esquema, y la sesión en Redis (fusión de cookies sin
// pisarse, tope absoluto de vida).
// Run: npx tsx --test src/tests/ewsGatewayRelay.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CONCURRENT_PER_SESSION, RelayEwsRequestUseCase, throttledBySession, type RelayEwsInput,
} from "../modules/agents/application/use-cases/ews-gateway-use-cases";
import type { EwsProxyGateway, EwsProxyResponse } from "../modules/agents/application/ports/ews-proxy-gateway";
import type { EwsSession, EwsSessionStore } from "../modules/agents/application/ports/ews-session-store";
import type { AuditLogWriter } from "../modules/agents/application/ports/audit-log-writer";
import {
  createEwsSession, destroyEwsSession, destroyEwsSessionsForAgent, readEwsSession, updateEwsSession, type EwsRedisClient,
} from "../services/ewsGatewayService";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("throttledBySession", () => {
  test("nunca hay más de 3 en vuelo por sesión, y el lugar pasa al que más espera", async () => {
    let inFlight = 0, max = 0;
    const order: number[] = [];
    const gates = Array.from({ length: 6 }, () => deferred<void>());
    const runs = gates.map((gate, i) => throttledBySession("s1", async () => {
      inFlight += 1; max = Math.max(max, inFlight); order.push(i);
      await gate.promise;
      inFlight -= 1;
    }));
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(max, MAX_CONCURRENT_PER_SESSION);
    assert.deepEqual(order, [0, 1, 2]);
    gates[1].resolve();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(order, [0, 1, 2, 3], "al liberarse UNO cualquiera arranca el 4º, sin carril fijo");
    for (const g of gates) g.resolve();
    await Promise.all(runs);
    assert.equal(max, MAX_CONCURRENT_PER_SESSION);
  });

  test("un rechazo o un throw síncrono no traban la sesión", async () => {
    await assert.rejects(throttledBySession("s2", () => { throw new Error("sync"); }), /sync/);
    await assert.rejects(throttledBySession("s2", () => Promise.reject(new Error("async"))), /async/);
    assert.equal(await throttledBySession("s2", async () => "sigue"), "sigue");
  });

  test("sesiones distintas no se estorban", async () => {
    const gate = deferred<void>();
    const busy = Array.from({ length: 3 }, () => throttledBySession("s3", () => gate.promise));
    assert.equal(await throttledBySession("s4", async () => "libre"), "libre");
    gate.resolve();
    await Promise.all(busy);
  });
});

const session: EwsSession = {
  userId: "u1", role: "admin", agentId: "a1", deviceId: "d1", clientId: "c1", ip: "10.20.0.31",
  label: "M4580", cookies: "", createdAt: new Date().toISOString(),
};

function fakes(responses: EwsProxyResponse[]) {
  const pushed: Array<Record<string, unknown>> = [];
  const updates: Array<unknown> = [];
  const audits: Array<Record<string, unknown>> = [];
  const gateway: EwsProxyGateway = {
    pushCommand: async (_a, _id, payload) => { pushed.push(payload); return true; },
    waitForResult: async () => responses.shift()!,
  };
  const sessions = { update: async (_id: string, patch: unknown) => { updates.push(patch); } } as unknown as EwsSessionStore;
  const audit = { write: async (entry: Record<string, unknown>) => { audits.push(entry); } } as unknown as AuditLogWriter;
  return { uc: new RelayEwsRequestUseCase(sessions, gateway, audit), pushed, updates, audits };
}

const input = (over: Partial<RelayEwsInput> = {}): RelayEwsInput => ({
  sessionId: "sid", session, method: "GET", path: "/", headers: { referer: "http://10.20.0.31/x" }, audit: true, ipAddress: "1.2.3.4", ...over,
});
const res = (status: number, headers: Record<string, string> = {}, extra: Partial<EwsProxyResponse> = {}): EwsProxyResponse =>
  ({ status, headers, bodyBase64: "", truncated: false, ...extra });

describe("RelayEwsRequestUseCase — cambio de esquema", () => {
  test("un 302 al otro esquema se reintenta una vez por ahí; la sesión lo aprende sólo si anduvo; se audita una vez", async () => {
    const { uc, pushed, updates, audits } = fakes([res(302, { location: "https://10.20.0.31/" }), res(200, { "content-type": "text/html" })]);
    const out = await uc.execute(input());
    assert.equal(out.status, 200);
    assert.equal(pushed.length, 2);
    assert.equal(pushed[1].protocol, "https");
    assert.equal((pushed[1].headers as Record<string, string>).referer, "https://10.20.0.31/x", "el Referer cambia de esquema con el pedido");
    assert.deepEqual(updates, [{ protocol: "https" }]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].ipAddress, "1.2.3.4");
  });

  test("si el reintento falla, la sesión NO queda pegada al esquema nuevo", async () => {
    const { uc, updates } = fakes([res(302, { location: "https://10.20.0.31/" })]);
    (uc as unknown as { gateway: EwsProxyGateway }).gateway.waitForResult = async () => { throw new Error("ECONNREFUSED 443"); };
    await assert.rejects(uc.execute(input()), /ECONNREFUSED/);
    assert.deepEqual(updates, []);
  });

  test("si tras el reintento sigue redirigiendo a lo mismo, se corta con 502 y no se reintenta de nuevo", async () => {
    const { uc, pushed } = fakes([res(302, { location: "https://10.20.0.31/" }), res(302, { location: "http://10.20.0.31/" })]);
    await assert.rejects(uc.execute(input()), /a sí mismo/);
    assert.equal(pushed.length, 2);
  });

  test("una respuesta cortada por tamaño no se sirve como 200 mudo", async () => {
    const { uc } = fakes([res(200, { "content-type": "text/javascript" }, { truncated: true })]);
    await assert.rejects(uc.execute(input({ audit: false })), /2 MB/);
  });

  test("las cookies se fusionan sobre el estado ACTUAL de la sesión, no sobre el snapshot", async () => {
    const { uc, updates } = fakes([res(200, {}, { setCookie: ["lang=es"] })]);
    await uc.execute(input({ audit: false }));
    const patch = updates[0] as (current: EwsSession) => Partial<EwsSession>;
    assert.equal(typeof patch, "function");
    assert.equal(patch({ ...session, cookies: "JSESSIONID=recien-guardada" }).cookies, "JSESSIONID=recien-guardada; lang=es");
  });

  test("la query no va a la auditoría: hay firmware que manda contraseñas por GET", async () => {
    const { uc, audits } = fakes([res(200)]);
    await uc.execute(input({ path: "/login.cgi?user=admin&pass=1234" }));
    assert.equal(audits[0].metadata && (audits[0].metadata as Record<string, unknown>).path, "/login.cgi");
  });
});

/** Redis de mentira: lo justo para el servicio, con `get`/`set` observables. */
function fakeRedis(): EwsRedisClient & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => { data.set(k, v); return "OK"; },
    getdel: async (k) => { const v = data.get(k) ?? null; data.delete(k); return v; },
    del: async (k) => (data.delete(k) || sets.delete(k) ? 1 : 0),
    expire: async () => 1,
    sadd: async (k, m) => { (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m); return 1; },
    srem: async (k, m) => (sets.get(k)?.delete(m) ? 1 : 0),
    smembers: async (k) => [...(sets.get(k) ?? [])],
  };
}

describe("ewsGatewayService — la sesión en Redis", () => {
  test("dos updates a la vez no se pisan: cada uno calcula sobre lo que el anterior escribió", async () => {
    const redis = fakeRedis();
    const id = await createEwsSession(redis, { ...session });
    await Promise.all([
      updateEwsSession(redis, id, (cur) => ({ cookies: `${cur.cookies}${cur.cookies ? "; " : ""}JSESSIONID=1` })),
      updateEwsSession(redis, id, (cur) => ({ cookies: `${cur.cookies}${cur.cookies ? "; " : ""}lang=es` })),
    ]);
    assert.equal((await readEwsSession(redis, id))?.cookies, "JSESSIONID=1; lang=es");
  });

  test("cerrar por monitor tumba todas sus sesiones y no las de otro", async () => {
    const redis = fakeRedis();
    const a1 = await createEwsSession(redis, { ...session });
    const a2 = await createEwsSession(redis, { ...session, deviceId: "d2" });
    const b = await createEwsSession(redis, { ...session, agentId: "a2" });
    await destroyEwsSession(redis, a2);
    assert.equal(await destroyEwsSessionsForAgent(redis, "a1"), 1, "a2 ya estaba cerrada: sólo cuenta a1");
    assert.equal(await readEwsSession(redis, a1), null);
    assert.ok(await readEwsSession(redis, b), "la del otro monitor sigue viva");
  });

  test("pasado el tope absoluto la sesión muere aunque se la siga usando", async () => {
    const redis = fakeRedis();
    const id = await createEwsSession(redis, { ...session });
    const raw = JSON.parse(redis.data.get(`ews-session:${id}`)!);
    raw.createdAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    redis.data.set(`ews-session:${id}`, JSON.stringify(raw));
    assert.equal(await readEwsSession(redis, id), null);
    assert.equal(redis.data.has(`ews-session:${id}`), false, "se borra, no sólo se ignora");
  });
});
