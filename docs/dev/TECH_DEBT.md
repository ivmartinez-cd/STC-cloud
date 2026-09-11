# 🧾 Registro de Deuda Técnica — STC Cloud

Inventario vivo de deuda técnica **conocida y aceptada**: cosas que funcionan a medias,
dependen de un paso manual, o fallan en silencio si se dan ciertas condiciones. No es un
backlog de features ni una lista de bugs abiertos — es lo que hay que recordar antes de
que muerda.

> Convención: cada ítem lleva ID, fecha de detección, impacto, y las referencias
> `archivo:línea` que lo prueban. Cuando se cierra, se marca ✅ con la fecha y el commit,
> y se deja en el doc (trazabilidad), no se borra.

**Última revisión:** 2026-09-11

---

## 📋 Índice de estado

| ID | Área | Título | Severidad | Estado |
| :--- | :--- | :--- | :--- | :--- |
| [UPD-1](#upd-1--no-hay-release-publicado-mas-nuevo-que-v100) | Actualizaciones | No hay release publicado más nuevo que v1.0.0 | 🔴 Alta | Abierto |
| [UPD-2](#upd-2--publicar-una-version-no-tiene-ui-solo-el-bat-o-curl) | Actualizaciones | Publicar una versión no tiene UI: solo el `.bat` o curl | 🟠 Media | Abierto |
| [UPD-3](#upd-3--la-metadata-de-version-publicada-no-tiene-respaldo-real-) | Actualizaciones | La metadata de versión publicada no tiene respaldo real | 🟠 Media | ✅ Cerrado |
| [UPD-4](#upd-4--la-clave-de-firma-ed25519-existe-en-una-sola-maquina) | Seguridad | La clave de firma Ed25519 existe en una sola máquina | 🔴 Alta | Abierto |
| [UPD-5](#upd-5--el-camino-real-de-actualizacion-zip-no-tiene-rollback-automatico) | Actualizaciones | El camino real de actualización (ZIP) no tiene rollback automático | 🟠 Media | Abierto |
| [UPD-6](#upd-6--publish-releasesh-sube-los-dos-canales-al-mismo-nombre-de-archivo) | Actualizaciones | `publish-release.sh` sube los dos canales al mismo nombre de archivo | 🟠 Media | Abierto |
| [DISC-1](#disc-1--las-constraints-por-item-de-ajv-siguen-tapando-los-errores-de-dominio) | Barrido | Las constraints por ítem de AJV siguen tapando los errores de dominio | 🟠 Media | Abierto |
| [DISC-2](#disc-2--el-total-del-barrido-que-ve-el-portal-no-cuenta-los-hostnames) | Barrido | El total del barrido que ve el portal no cuenta los hostnames | 🟡 Baja | Abierto |
| [DISC-3](#disc-3--apagar-un-rango-reinicia-la-vuelta-de-barrido-en-curso) | Barrido | Apagar un rango reinicia la vuelta de barrido en curso | 🟡 Baja | Abierto |
| [UI-1](#ui-1--la-fila-nueva-de-monitorspecscard-no-fue-verificada-a-1920x900) | Portal | La fila nueva de `MonitorSpecsCard` no fue verificada a 1920x900 | 🟡 Baja | Abierto |
| [ARCH-1](#arch-1--iprange-quedo-sin-consumidores-en-produccion) | Agente | `ipRange()` quedó sin consumidores en producción | 🟡 Baja | Abierto |
| [ARCH-2](#arch-2--sizes-baselinejson-lista-un-archivo-que-ya-no-existe) | Arquitectura | `sizes-baseline.json` lista un archivo que ya no existe | 🟡 Baja | Abierto |

---

## 🔄 Actualización remota del agente (OTA)

### Cómo funciona hoy (contexto para todos los ítems de abajo)

La cadena completa está implementada y es correcta end-to-end:

1. **El agente pregunta.** Chequea al arrancar (`agent/src/core/main.ts:98`), cada 4 h
   (`main.ts:103`), cada 10 s si aparece el flag `force-update.flag` (`main.ts:157`), y por
   comando remoto `FORCE_UPDATE` disparado desde el portal
   (`cloud/portal/src/features/monitors/components/RemoteToolsPanel.tsx:18`).
2. **El backend responde** `GET /api/v1/agents/version`
   (`cloud/src/modules/auth/presentation/auth-routes.ts:161`, con `agentAuth`) devolviendo
   `{version, url, hash}` con una cascada de 3 fuentes: Redis → `local_settings.json` →
   variables de entorno (`agent-version-controller.ts:9-40`).
3. **La publicación** la hace `installer/build-installer.bat`: bumpea la versión en 4
   archivos (incluido `agent/src/core/version.ts`, la fuente única), compila `bundle.js` y
   `stc-update.zip`, los firma Ed25519 (`installer/sign-bundle.js` → `.sig`), crea el
   GitHub Release, sube los 4 assets (paso 7) y hace el `POST` a
   `/api/v1/portal/agents/version` con URL + SHA256 (paso 8).
4. **El agente valida antes de instalar** (`agent/src/core/UpdateService.ts`): prefijo de
   URL obligatorio (`ALLOWED_URL_PREFIX`, línea 53), tamaño mínimo de 50 KB, SHA256 contra
   el `hash` publicado, y **firma Ed25519 obligatoria** — la clave pública ya está seteada
   en `agent/src/core/updateKey.ts`, así que si falta el `.sig` el update se rechaza.
   Después extrae a staging y parchea con un `.bat` lanzado vía WMI para escapar del job
   object de NSSM (`applyZipUpdate`, línea 253).

El problema no está en el diseño. Está en que **el último eslabón (publicar) es manual y
frágil**, y en que la clave que sostiene todo el esquema de firma vive en un solo lugar.

---

### UPD-1 — No hay release publicado más nuevo que v1.0.0

**Detectado:** 2026-09-08 · **Severidad:** 🔴 Alta · **Estado:** Abierto

El único GitHub Release publicado es **`v1.0.0`, del 2026-05-28**, mientras el repo va por
`1.3.0` (`agent/src/core/version.ts:6`, `installer/STC-Monitor.iss:7`). Desde mayo no se
corrió `build-installer.bat` con `GITHUB_TOKEN` seteado, así que **no hay nada nuevo para
que un agente descargue**.

Consecuencia concreta: si un cliente en prueba tiene 1.3.0 instalado a mano (con
`update-installed-agent.bat` o el instalador local) y el server sigue apuntando a v1.0.0,
`isNewerVersion()` la considera más vieja y el agente no hace nada. El comportamiento es
correcto, pero el resultado es que **ese cliente nunca se actualiza solo**.

Los 4 assets de v1.0.0 sí están completos y bien formados (`bundle.js`, `stc-update.zip`,
y sus dos `.sig` de 64 bytes), o sea que el pipeline de build/firma/upload **funcionó** la
última vez que se corrió. Es un problema de no haberlo vuelto a correr, no de que esté roto.

**Para cerrarlo:** correr `installer\build-installer.bat` desde Windows con `GITHUB_TOKEN`,
`STC_PORTAL_TOKEN` y `STC_API_URL` seteadas, bumpeando a 1.3.1+.

**Actualización 10/09/2026:** con la Fase 1 de OTA multi-canal (ver sección de arriba y
commit `40ac3e5`) el canal `legacy` ya tiene su primer release real publicado (v1.3.0, mismo
número de versión que ya tenía instalado ISSN — republicación intencional para que el agente
adopte el canal, no dispara auto-update por versión igual). El canal `stable` sigue sin nada
publicado más nuevo que v1.0.0 — este ítem queda parcialmente cerrado: la falla de fondo
(nadie corrió el paso de publicación) sigue latente para `stable` hasta la primera vez que se
use `installer\build-installer.bat` con las credenciales seteadas, o `publish-release.sh` a mano.

---

### UPD-2 — Publicar una versión no tiene UI: solo el `.bat` o curl

**Detectado:** 2026-09-08 · **Severidad:** 🟠 Media · **Estado:** Abierto

El endpoint `POST /api/v1/portal/agents/version` existe, pide rol `admin` y está testeado
por RBAC (`auth-routes.ts:166`, `agent-version-controller.ts:43-52`,
`cloud/src/tests/rbacMutationsDenied2.test.ts:187`), pero **ningún componente del portal lo
llama**. La única forma de publicar es el paso 8 de `build-installer.bat` o un curl a mano.

Peor: ese paso 8 **se saltea con un simple aviso, no falla**, si `STC_PORTAL_TOKEN` o
`STC_API_URL` no están seteadas (`build-installer.bat:329-341`). O sea que un build puede
terminar diciendo "BUILD COMPLETO", dejar el release perfecto en GitHub, y **los agentes
nunca enterarse de que existe**.

**Para cerrarlo:** o bien agregar una pantalla de admin en el portal que consuma ese
endpoint, o bien hacer que el paso 8 del `.bat` sea un error duro en vez de un aviso.

---

### UPD-3 — La metadata de versión publicada no tiene respaldo real ✅

**Detectado:** 2026-09-08 · **Severidad:** 🟠 Media · **Estado:** Cerrado 10/09/2026 (commit `40ac3e5`)

**Cerrado:** la cascada Redis → `local_settings.json` → env vars se eliminó por completo.
`agent-version-controller.ts` ahora lee/escribe la tabla `agent_releases` (Postgres, con
backup automático vía el servicio `backup` de `docker-compose.prod.yml`) a través de
`KnexAgentReleaseRepository`. De paso quedó separado por canal (`stable`/`legacy`, ver
sección de arriba) — un agente legacy ya no compite por la misma fila de metadata que uno
moderno. `agentVersionService.ts` y `RedisAgentVersionReader` (dashboard) se borraron, ya
no había ningún consumidor real de esa ruta.

<details>
<summary>Contexto original (antes del fix)</summary>

`agent-version-controller.ts` tiene una cascada de 3 fuentes pensada como redundancia, pero
en producción **solo la primera es real**:

| Fuente | Estado en prod |
| :--- | :--- |
| Redis (`stc:agent_version_metadata`) | ✅ Persiste — el servicio tiene volumen `redisdata` con `--appendonly yes` |
| `local_settings.json` (cwd del proceso) | ❌ **No persiste** — el servicio `api` de `docker-compose.prod.yml` no tiene `volumes`, así que el archivo se escribe adentro del contenedor y muere en cada rebuild |
| Env vars `AGENT_VERSION` / `AGENT_DOWNLOAD_URL` / `AGENT_HASH` | ❌ Están comentadas en `.env.production.example:76-78` |

Si alguna vez se hace `docker compose down -v` o se pierde el volumen de Redis, el fallback
devuelve `{version: "1.0.0", url: null}` y `UpdateService.checkForUpdate()` corta en
`if (!data.version || !data.url) return false` (línea 51) — **sin ningún error visible, ni
en el agente ni en el portal**. Los agentes simplemente dejan de recibir actualizaciones.

Nota adicional: con `API_REPLICAS > 1` cada réplica escribiría su propio
`local_settings.json` con contenido distinto. Hoy no importa porque Redis es la fuente
efectiva, pero convierte al archivo en un respaldo engañoso.

**Para cerrarlo:** montar un volumen para `local_settings.json` en el servicio `api`, o
mover la metadata a Postgres (que ya tiene backup automático), o al menos loguear un WARN
cuando la cascada cae al fallback por defecto.

</details>

---

### UPD-4 — La clave de firma Ed25519 existe en una sola máquina

**Detectado:** 2026-09-08 · **Severidad:** 🔴 Alta · **Estado:** Abierto

`installer/signing.key` **no está trackeada en git** (correcto: está en `.gitignore` y no
aparece en `git ls-files installer/`). Existe únicamente en el working tree de la máquina de
desarrollo.

El riesgo no es que se filtre — es que se pierda. Si se buildea desde otra PC,
`installer/gen-keys.js` genera un par nuevo y **reescribe `agent/src/core/updateKey.ts`**.
A partir de ahí, todos los agentes ya instalados en clientes rechazan cualquier update por
firma inválida (`UpdateService.ts:127-133`), y **no hay forma de recuperarlos
remotamente**: habría que reinstalar a mano en cada equipo.

Es la única pieza del sistema sin la cual el parque instalado queda permanentemente huérfano.

**Para cerrarlo:** respaldar `installer/signing.key` fuera de la máquina (gestor de
secretos, no el repo) y documentar dónde quedó. Idealmente agregar un guard que impida a
`gen-keys.js` sobrescribir una key existente sin confirmación explícita.

---

### UPD-5 — El camino real de actualización (ZIP) no tiene rollback automático

**Detectado:** 2026-09-08 · **Severidad:** 🟠 Media · **Estado:** Abierto

Hay dos caminos de update y el rollback automático solo cubre el que **no** se usa en
producción:

| Camino | Rollback |
| :--- | :--- |
| Bundle single-file (`.js`) | ✅ Guarda `.bak` + `.bak.version` antes de reemplazar (`UpdateService.ts:147-151`) |
| **ZIP (`stc-update.zip`)** | ❌ Solo un backup **manual** en `${installDir}_backup` vía robocopy (`UpdateService.ts:262-276`) |

`build-installer.bat:332` publica `DLURL` apuntando a `stc-update.zip`, así que **el flujo
real de producción es el ZIP**. El motivo del gap está documentado en el propio código: el
parcheo corre en un `.bat` fire-and-forget fuera del proceso Node, sin nadie vivo para
decidir "esto falló, revertí" después del robocopy.

Además, `rollbackToPreviousVersion()` está implementado y tiene tests
(`agent/src/tests/updateRollback.test.ts`), pero **no lo llama nadie en runtime** — solo los
tests. No hay detección de "arranqué y me morí, volvé atrás".

**Para cerrarlo:** un watchdog post-update (el `.bat` deja un flag, el agente lo borra al
arrancar bien; si el flag sigue ahí en el próximo arranque del servicio, restaurar
`${installDir}_backup`), o al menos exponer el rollback como comando remoto desde el portal.

---

### UPD-6 — `publish-release.sh` sube los dos canales al mismo nombre de archivo

**Detectado:** 2026-09-11 · **Severidad:** 🟠 Media · **Estado:** Abierto

`publish-release.sh` sube el archivo a `~/stc-cloud/agent-updates/$(basename "$FILE")`
(`publish-release.sh:68`) y publica `$API_URL/updates/$(basename "$FILE")` como URL del
release (`publish-release.sh:81`). El nombre del bundle compilado es siempre `bundle.js`
para los dos canales (`agent/build-sea.js` escribe `dist/bundle.js` y `dist-legacy/bundle.js`
respectivamente) — el path de salida cambia, pero el `basename` no. O sea que **`stable` y
`legacy` comparten el mismo archivo remoto y la misma URL pública**, aunque
`agent_releases` (Postgres) sí los separa bien por canal (ver cierre de UPD-3).

Hoy no se nota porque ambos bundles salen byte a byte idénticos (mismo hash) — no hay
código en `agent/src` que dependa de `--target node20` vs `node24`, así que esbuild produce
el mismo output. Pero el día que dejen de serlo, publicar un canal después del otro
**pisa el archivo del que se publicó primero en el servidor**: la fila de metadata de ese
canal en la base queda con el hash correcto, pero el archivo real en `/updates/bundle.js`
pasa a ser el del otro canal — el agente lo descarga, la verificación SHA256 falla
(`UpdateService.ts:108-115`) y la actualización se descarta en silencio (sin romper nada,
pero sin actualizar tampoco).

**Para cerrarlo:** nombrar el archivo remoto incluyendo el canal (p. ej.
`bundle-${channel}.js`) en vez de sólo `basename`, o subir cada canal a su propia
subcarpeta (`agent-updates/stable/`, `agent-updates/legacy/`).

---

## 🔍 Barrido continuo (discovery por chunks)

Contexto: desde 2026-09-11 el agente no barre todos los rangos de una sola pasada —
hace un chunk time-boxed por corrida y persiste un cursor (`agent/src/core/DiscoveryCursor.ts`,
tabla `scan_state` en `agent/src/sync/database.ts`). Los ítems de abajo son los bordes
conocidos de ese cambio y de la subida de topes que lo acompañó.

### DISC-1 — Las constraints por ítem de AJV siguen tapando los errores de dominio

**Detectado:** 2026-09-11 · **Severidad:** 🟠 Media · **Estado:** Abierto

Se arregló el `maxItems` **del array** (`portal-agent-routes.ts:48`, 20 → 512), pero las
constraints **por ítem** de `ipRangeItemSchema` (`portal-agent-routes.ts:24-33`) siguen
teniendo el mismo problema que motivó ese fix:

| Constraint | Qué pasa si se excede |
| :--- | :--- |
| `label.maxLength: 100` | 400 de AJV |
| `start`/`end`/`cidr` `maxLength` 15/15/18 | 400 de AJV |
| `exclude.maxItems: 32` | 400 de AJV |

Un 400 de AJV responde `{statusCode, code, error: "Bad Request", message}` y el portal lee
`error` (`api.ts`), así que al operador le llega **"Bad Request" pelado** en vez del mensaje
en castellano con `field` que arma `validateIpRangeSpecs()`. Es exactamente el modo de falla
que hacía ilegible el caso de las 59 sedes, sólo que ahora hay que pegarle a un ítem
individual mal formado en vez de a la lista entera — bastante menos probable, pero igual de
opaco cuando pasa.

**Para cerrarlo:** aflojar esas constraints por encima del tope de dominio equivalente (mismo
criterio que `MAX_IP_RANGE_ITEMS`) y que el rechazo lo haga el dominio, o instalar un
`setErrorHandler` que traduzca los errores de validación de Fastify al shape `{error, field}`
que el portal ya sabe mostrar.

---

### DISC-2 — El total del barrido que ve el portal no cuenta los hostnames

**Detectado:** 2026-09-11 · **Severidad:** 🟡 Baja · **Estado:** Abierto

`totalDeclaredIps()` suma sólo rangos (`DiscoveryCursor.ts`, recibe `CursorRange[]`), y es lo
que va a `discovery_state.total` (`agent/src/core/ScanService.ts:183`). Los hostnames son
point lookups: se resuelven aparte, con su propio presupuesto, y no entran en el cursor.

Es correcto **para el cursor** — un hostname no tiene posición en el recorrido — pero el
portal muestra ese número como "IPs declaradas totales" en la fila BARRIDO AUTOMÁTICO. Una
config mayormente de hostnames (hasta 32) muestra un total más chico que lo que realmente se
sondea. Nadie se rompe; el número simplemente miente un poco.

**Para cerrarlo:** o sumarle la cantidad de hosts al `total` que se reporta, o renombrar el
label del portal a algo que diga la verdad ("IPs en el recorrido").

---

### DISC-3 — Apagar un rango reinicia la vuelta de barrido en curso

**Detectado:** 2026-09-11 · **Severidad:** 🟡 Baja · **Estado:** Abierto

El cloud filtra las entradas con `enabled: false` antes de mandarlas
(`cloud/src/shared/domain/ip-range-spec/compile.ts:79` y `:101`), así que apagar un rango
cambia la lista compilada que le llega al agente, eso cambia `fingerprintRanges()`
(`DiscoveryCursor.ts`) y el agente arranca la vuelta de cero.

Es **defendible**: el conjunto de cosas a barrer efectivamente cambió, y el fingerprint está
hecho justo para detectar eso (por lo mismo excluye a propósito `credential_ids` y `label`,
que no cambian el recorrido). Lo que no está bien es que **el portal no lo dice**: el toggle
parece un filtro de visualización y en realidad, en un parque grande, tira a la basura hasta
una hora de recorrido.

**Para cerrarlo:** avisarlo en la UI al togglear (mismo lugar donde ya aparece el aviso de
vuelta larga), o hacer que el cursor sobreviva reasignándose por `start-end` en vez de por
índice cuando el cambio es sólo una baja.

---

### UI-1 — La fila nueva de `MonitorSpecsCard` no fue verificada a 1920x900

**Detectado:** 2026-09-11 · **Severidad:** 🟡 Baja · **Estado:** Abierto

`specRows()` (`cloud/portal/src/features/monitors/components/MonitorSpecsCard.tsx:56-70`)
devuelve 9 filas fijas más una condicional — BARRIDO AUTOMÁTICO (`:68`), que aparece **sólo**
cuando el agente reporta `discovery_state`. O sea: la tarjeta de 10 filas todavía no existió
en pantalla, porque ningún agente en producción corre la versión que lo reporta.

El patrón de la app es que toda pantalla entre en 1920x1080 **y** en 1920x900 (el viewport
real de Iván) sin scroll interno. La verificación pendiente es visual y no la puede hacer
Claude: Playwright está prohibido por regla global (tilda el entorno).

**Para cerrarlo:** que Iván abra el detalle del monitor de ISSN después del deploy de 1.4.0 y
confirme que la décima fila entra a 1920x900; si no entra, la variante `short:` de la tarjeta
es donde se ajusta.

---

### ARCH-1 — `ipRange()` quedó sin consumidores en producción

**Detectado:** 2026-09-11 · **Severidad:** 🟡 Baja · **Estado:** Abierto

`ipRange()` (`agent/src/core/NetworkUtils.ts:7`) es un generador que expande un rango IP a IP.
Con el barrido por chunks, el planificador pasó a hacer aritmética entera sobre los extremos
(O(rangos), no O(IPs)) y nadie lo llama más: los únicos call-sites que quedan son sus propios
tests (`agent/src/tests/networkUtils.test.ts:11,15,19`).

Es código muerto que los tests mantienen vivo, así que ninguna guarda estática lo va a marcar.
Se deja por ahora porque expandir un rango sigue siendo útil para diagnóstico desde la consola.

**Para cerrarlo:** borrarlo junto con su test, o darle un consumidor real (por ejemplo el
`list disc` de la consola STC).

---

### ARCH-2 — `sizes-baseline.json` lista un archivo que ya no existe

**Detectado:** 2026-09-11 · **Severidad:** 🟡 Baja · **Estado:** Abierto

`cloud/scripts/sizes-baseline.json:1238` sigue teniendo la entrada de
`portal/src/features/monitors/components/MonitorMetricsStrip.tsx`, borrado en el commit de
carga masiva de rangos.

`check-sizes` pasa igual: el checker sólo consulta la baseline para archivos que existen en
el árbol, así que una entrada huérfana nunca se lee. Pero es ruido que ensucia el archivo y
que "perdonaría" a un archivo futuro que se llamara igual.

**Para cerrarlo:** `npm run check:sizes:baseline -w cloud` en la próxima corrida que toque
tamaños (regenera la deuda desde el árbol actual, así que la entrada huérfana desaparece
sola), o agregarle al checker un aviso cuando una entrada de la baseline no matchea ningún
archivo.

---

## 📎 Cómo agregar un ítem

1. Asignar un ID con prefijo de área (`UPD-`, `SEC-`, `PERF-`, `ARCH-`…) y número correlativo.
2. Sumarlo al índice de estado de arriba.
3. En el cuerpo: fecha de detección, severidad, qué se rompe **en concreto** (no "podría ser
   mejor"), las referencias `archivo:línea` que lo prueban, y qué haría falta para cerrarlo.
4. Al cerrarlo, marcar ✅ con fecha y commit — no borrar la entrada.
