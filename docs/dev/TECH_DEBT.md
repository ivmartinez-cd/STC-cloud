# 🧾 Registro de Deuda Técnica — STC Cloud

Inventario vivo de deuda técnica **conocida y aceptada**: cosas que funcionan a medias,
dependen de un paso manual, o fallan en silencio si se dan ciertas condiciones. No es un
backlog de features ni una lista de bugs abiertos — es lo que hay que recordar antes de
que muerda.

> Convención: cada ítem lleva ID, fecha de detección, impacto, y las referencias
> `archivo:línea` que lo prueban. Cuando se cierra, se marca ✅ con la fecha y el commit,
> y se deja en el doc (trazabilidad), no se borra.

**Última revisión:** 2026-09-08

---

## 📋 Índice de estado

| ID | Área | Título | Severidad | Estado |
| :--- | :--- | :--- | :--- | :--- |
| [UPD-1](#upd-1--no-hay-release-publicado-mas-nuevo-que-v100) | Actualizaciones | No hay release publicado más nuevo que v1.0.0 | 🔴 Alta | Abierto |
| [UPD-2](#upd-2--publicar-una-version-no-tiene-ui-solo-el-bat-o-curl) | Actualizaciones | Publicar una versión no tiene UI: solo el `.bat` o curl | 🟠 Media | Abierto |
| [UPD-3](#upd-3--la-metadata-de-version-publicada-no-tiene-respaldo-real-) | Actualizaciones | La metadata de versión publicada no tiene respaldo real | 🟠 Media | ✅ Cerrado |
| [UPD-4](#upd-4--la-clave-de-firma-ed25519-existe-en-una-sola-maquina) | Seguridad | La clave de firma Ed25519 existe en una sola máquina | 🔴 Alta | Abierto |
| [UPD-5](#upd-5--el-camino-real-de-actualizacion-zip-no-tiene-rollback-automatico) | Actualizaciones | El camino real de actualización (ZIP) no tiene rollback automático | 🟠 Media | Abierto |

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

## 📎 Cómo agregar un ítem

1. Asignar un ID con prefijo de área (`UPD-`, `SEC-`, `PERF-`, `ARCH-`…) y número correlativo.
2. Sumarlo al índice de estado de arriba.
3. En el cuerpo: fecha de detección, severidad, qué se rompe **en concreto** (no "podría ser
   mejor"), las referencias `archivo:línea` que lo prueban, y qué haría falta para cerrarlo.
4. Al cerrarlo, marcar ✅ con fecha y commit — no borrar la entrada.
