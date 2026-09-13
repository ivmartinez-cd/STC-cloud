// Gateway de EWS navegable — la lógica pura: qué headers cruzan entre el
// navegador y la impresora, cómo se reescriben los redirects, y el jar de
// cookies del equipo que vive del lado del servidor.
// Run: npx tsx --test src/tests/ewsGateway.test.ts
//
// Esto es lo que hay que romper para abrir un agujero acá: que una cookie del
// equipo llegue al navegador, que la cookie de sesión del gateway llegue a la
// impresora, o que un `Location` mande al operador a una IP de la LAN del
// cliente. Cada uno de esos tres tiene su test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isNavigation, isWriteMethod, pathFromUrl, requestHeadersFor, responseHeadersFor, rewriteLocation,
} from "../modules/agents/presentation/ews-gateway-http";
import { mergeCookieJar } from "../services/ewsGatewayService";
import { deviceOriginOf, schemeSwitchFor } from "../modules/agents/application/use-cases/ews-gateway-use-cases";

const ORIGIN = "http://10.20.0.31";

describe("pathFromUrl", () => {
  test("saca el prefijo interno y conserva la query", () => {
    assert.equal(pathFromUrl("/__ews/sws/app/information/home/home.json"), "/sws/app/information/home/home.json");
    assert.equal(pathFromUrl("/__ews/x?y=1&z=2"), "/x?y=1&z=2");
    assert.equal(pathFromUrl("/__ews"), "/");
  });
});

describe("requestHeadersFor — lo que llega a la impresora", () => {
  test("la cookie del NAVEGADOR nunca viaja: sólo el jar de la sesión", () => {
    const out = requestHeadersFor({ cookie: "stc_ews=secreto-de-sesion" }, "SESSIONID=de-la-impresora", ORIGIN);
    assert.equal(out.cookie, "SESSIONID=de-la-impresora");
    assert.ok(!out.cookie.includes("stc_ews"), "el id de sesión del gateway no es asunto de la impresora");
  });

  test("sin jar no se manda header cookie vacío", () => {
    assert.equal(requestHeadersFor({}, "", ORIGIN).cookie, undefined);
  });

  test("authorization sí viaja: es el Basic auth del equipo de punta a punta", () => {
    const out = requestHeadersFor({ authorization: "Basic YWRtaW46MTIzNA==" }, "", ORIGIN);
    assert.equal(out.authorization, "Basic YWRtaW46MTIzNA==");
  });

  test("referer y origin se reescriben al equipo, no se filtra el hostname del gateway", () => {
    const out = requestHeadersFor({ referer: "https://ews.stc.example/sws/form.html?a=1", origin: "https://ews.stc.example" }, "", ORIGIN);
    assert.equal(out.referer, "http://10.20.0.31/sws/form.html?a=1", "hay firmware que valida el Referer como anti-CSRF");
    assert.equal(out.origin, ORIGIN);
  });

  test("lo que está bloqueado no cruza", () => {
    const out = requestHeadersFor({ "x-forwarded-for": "1.2.3.4", "user-agent": "Firefox", connection: "keep-alive", host: "ews.stc.example" }, "", ORIGIN);
    assert.equal(out["x-forwarded-for"], undefined, "no se le revela al equipo dónde vive nuestra nube");
    assert.equal(out.connection, undefined);
    assert.equal(out.host, undefined);
    assert.equal(out["user-agent"], undefined, "el User-Agent lo pone el agente, no el navegador");
  });

  test("X-Requested-With cruza: sin eso el firmware contesta 302 en vez del JSON", () => {
    assert.equal(requestHeadersFor({ "x-requested-with": "XMLHttpRequest" }, "", ORIGIN)["x-requested-with"], "XMLHttpRequest");
  });

  test("una cabecera cualquiera del navegador también cruza (blocklist, no allowlist)", () => {
    const out = requestHeadersFor({ "x-token-del-firmware": "abc", "if-none-match": "W/x" }, "", ORIGIN);
    assert.equal(out["x-token-del-firmware"], "abc");
    assert.equal(out["if-none-match"], "W/x");
  });
});

describe("responseHeadersFor — lo que vuelve al navegador", () => {
  test("set-cookie del equipo NUNCA vuelve: se queda en la sesión del servidor", () => {
    const out = responseHeadersFor({ "set-cookie": "SESSIONID=admin; Path=/", "content-type": "text/html" }, ORIGIN);
    assert.equal(out["set-cookie"], undefined);
    assert.equal(out["content-type"], "text/html");
  });

  test("se descartan las políticas del firmware que asumen que la página se sirve desde el equipo", () => {
    const out = responseHeadersFor({
      "content-security-policy": "default-src 'self' http://10.20.0.31",
      "x-frame-options": "SAMEORIGIN",
      "strict-transport-security": "max-age=31536000",
      "content-length": "1234",
      "content-encoding": "gzip",
    }, ORIGIN);
    assert.deepEqual(out, {}, "todas romperían la página servida desde el gateway");
  });
});

describe("rewriteLocation", () => {
  test("un redirect absoluto al propio equipo se vuelve relativo", () => {
    // El caso real: la home de la Samsung contesta 302 hacia su propia IP.
    assert.equal(rewriteLocation("http://10.20.0.31/sws/index.html", ORIGIN), "/sws/index.html");
    assert.equal(rewriteLocation("https://10.20.0.31/x?y=1#z", ORIGIN), "/x?y=1#z", "también si cambia de esquema");
  });

  test("un redirect que ya es relativo se deja igual", () => {
    assert.equal(rewriteLocation("/sws/index.html", ORIGIN), "/sws/index.html");
  });

  test("un redirect a OTRO host se deja intacto: el gateway no redirige a terceros", () => {
    assert.equal(rewriteLocation("https://www.samsung.com/soporte", ORIGIN), "https://www.samsung.com/soporte");
  });
});

describe("schemeSwitchFor — el equipo pide que le hablen por el otro esquema", () => {
  test("un redirect a sí mismo cambiando a https devuelve el esquema nuevo", () => {
    // El bucle real del 13/09/2026: sin esto la reescritura a ruta relativa se
    // come el cambio de esquema y el navegador gira sobre la misma URL.
    assert.equal(schemeSwitchFor("https://10.20.0.31/", ORIGIN), "https");
    assert.equal(schemeSwitchFor("https://10.20.0.31/sws/index.sws", ORIGIN), "https");
  });

  test("y al revés, si el equipo baja a http", () => {
    assert.equal(schemeSwitchFor("http://10.20.0.31/", "https://10.20.0.31"), "http");
  });

  test("mismo esquema, relativo o vacío: no hay nada que cambiar", () => {
    assert.equal(schemeSwitchFor("http://10.20.0.31/sws/x", ORIGIN), null);
    assert.equal(schemeSwitchFor("/sws/x", ORIGIN), null);
    assert.equal(schemeSwitchFor(undefined, ORIGIN), null);
  });

  test("otro host no cambia el protocolo de la sesión ni aunque sea https", () => {
    assert.equal(schemeSwitchFor("https://www.samsung.com/", ORIGIN), null);
  });
});

describe("deviceOriginOf", () => {
  test("usa el protocolo que la sesión ya acertó, y http por defecto", () => {
    const base = { ip: "10.20.0.31" } as Parameters<typeof deviceOriginOf>[0];
    assert.equal(deviceOriginOf(base), "http://10.20.0.31");
    assert.equal(deviceOriginOf({ ...base, protocol: "https" }), "https://10.20.0.31");
  });
});

describe("mergeCookieJar", () => {
  test("suma cookies nuevas y pisa las repetidas", () => {
    assert.equal(mergeCookieJar("", ["SESSIONID=abc; Path=/"]), "SESSIONID=abc");
    assert.equal(mergeCookieJar("SESSIONID=viejo; lang=es", ["SESSIONID=nuevo; Path=/"]), "SESSIONID=nuevo; lang=es");
  });

  test("respeta el borrado: así es como el firmware cierra la sesión", () => {
    assert.equal(mergeCookieJar("SESSIONID=abc; lang=es", ["SESSIONID=; Max-Age=0"]), "lang=es");
    assert.equal(mergeCookieJar("SESSIONID=abc", ["SESSIONID=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]), "");
  });

  test("un valor con '=' adentro (base64) sobrevive entero", () => {
    assert.equal(mergeCookieJar("", ["token=YWRtaW46MTIzNA==; Path=/"]), "token=YWRtaW46MTIzNA==");
  });
});

describe("clasificación de la petición", () => {
  test("sólo GET y HEAD no son escritura", () => {
    assert.equal(isWriteMethod("GET"), false);
    assert.equal(isWriteMethod("HEAD"), false);
    assert.equal(isWriteMethod("POST"), true);
    assert.equal(isWriteMethod("put"), true);
  });

  test("se audita la navegación, no cada imagen de la página", () => {
    assert.equal(isNavigation({ accept: "text/html,application/xhtml+xml" }), true);
    assert.equal(isNavigation({ accept: "image/avif,image/webp,*/*" }), false);
    assert.equal(isNavigation({}), false);
  });
});
