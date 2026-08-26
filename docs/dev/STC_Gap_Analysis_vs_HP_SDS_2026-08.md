# Gap Analysis: STC Cloud vs HP SDS — y riesgos a futuro

**Fecha:** 21 de agosto de 2026 · **Base:** lectura completa de `docs/**` (37 documentos, incl. los 7 PDFs de HP SDS y el manual del STC legado de Canal Directo) + auditoría del código real en `agent/`, `cloud/`, `cloud/portal/`, `installer/`, `monitor-ui/` y CI.
**Propósito:** saber qué nos separa todavía de HP SDS Manager (y de un MPS "por encima de lo básico"), qué afirmaciones de la documentación ya no son ciertas, y qué va a fallar si crece la flota.

> Convención: cada hallazgo cita `archivo:línea` para que se pueda verificar. "SDS" = HP SDS Manager / JAMC según los white papers en `docs/pdfs/hp_sds/`.

---

## Estado de implementación (actualizado 22 de agosto de 2026)

Este documento sigue siendo la foto original del 21/08. Esta sección se actualiza a
medida que se cierran ítems del roadmap de §4, para no tener que releer todo el
análisis para saber qué falta. El resto del documento (§1-§3) describe el estado
**al momento de la auditoría** — donde algo ya se resolvió, esta sección lo dice
explícitamente; si no aparece acá, sigue tal como está descrito abajo.

### Fase 0 — Parar hemorragias — ✅ **completa**
Los 7 ítems de §4 Fase 0 están cerrados: cola del agente (no purga lo no
sincronizado), idempotencia (`reading_id` + `ON CONFLICT`), migración de
reconciliación (hypertable + índices `readings(device_id,time)`,
`alerts(device_id,resolved)`, `audit_logs(created_at)`, `agents(client_id)` — **ya
no falta ninguno de los índices que pedía §2.7/R3**), detección de `counter_reset`
(agente y cálculo mensual por suma de deltas), seguridad mínima (CSRF, sin login de
respaldo, `trustProxy`, schema en `createClient`/`PUT /agents/:id/config`, audit en
deletes/comandos), operación (`restart: unless-stopped`, `/health` real con DB+Redis,
límites de recursos, `USER node`, `npm ci`), y versión única (`agent/src/core/version.ts`,
`cloud/src/version.ts`). Commits: `55ed144`, `94877db`, `0686c6f`.

✅ **CI completo — Fase 0 ahora 7 de 7 ítems cerrados** (23/08/2026): el job
`agent` ya corría `capture.test.ts`; faltaba el e2e del backend. El job `api`
de `.github/workflows/ci.yml` ahora levanta Postgres (TimescaleDB) + Redis
como service containers, arranca la API compilada (migra + bootstrap admin en
su propio boot), corre `npm run seed` y ejecuta los 9 archivos de test de
`cloud` vía `cloud/scripts/ci-test-runner.mjs` (FLUSHDB de Redis entre
archivo y archivo, evita 429 falsos del rate-limiter compartiendo ventana).
Validado localmente replicando la topología real de un runner (Postgres/Redis
en contenedores aislados, proceso de Node corriendo fuera de Docker) — 263/263
tests verdes.

✅ **Política de retención** (23/08/2026): `readings` usa `add_retention_policy`
nativo de TimescaleDB (`drop_after: 2 years` — confirmado corriendo en
`timescaledb_information.jobs`); `agent_logs` (>90 días) y `alerts` **resueltas**
(>12 meses; las abiertas nunca se purgan) se purgan vía job periódico app-level
(`cloud/src/jobs/retentionJob.ts`, mismo patrón `setInterval` que
`heartbeatMonitor.ts` — se descartó BullMQ por el riesgo de eviction de Redis en
prod y `pg_cron` porque prod corre sobre Neon gestionado sin la extensión).
`audit_logs` queda **sin purga automática** por decisión explícita: es un trail
de auditoría write-only (sin ningún endpoint que lo lea), purgarlo por defecto
sería la decisión incorrecta. No hay ningún número de retención comprometido
como requisito legal en la documentación — las ventanas elegidas son una
decisión de negocio, no una obligación de compliance.

### Fase 1 — Paridad operativa con SDS — completa: 9 de 9 ítems cerrados
- ✅ **RBAC por cliente** (commit `7a47ce6`): rol `client_viewer`, scoping por
  `client_id` en los ~19 endpoints de lectura relevantes, deny-by-default por rol y
  por ruta. §2.6 "Jerarquía" y "Auth" (parte de CSRF/backdoor) quedan resueltos.
  **Lo que NO se hizo de §2.6**: paginación server-side (sigue sin paginación
  ninguna tabla), MFA/lockout, y la limpieza de dead code (`pages/Devices.tsx`,
  `pages/Monitors.tsx`, `EditMonitorModal.tsx`, rutas `/reports` y `/monitoring`).
- ✅ **Alert loop / ciclo de vida / notificaciones** (commit `42951b6`): alertas
  `agent_offline` y `device_offline` (antes el enum existía pero nadie las
  escribía), ack/resolve (`PUT /alerts/:id`, página `/alerts` en el portal con
  filtros), y notificaciones reales por email (nodemailer) + webhook (con guard
  SSRF), disparadas por cola cuando se abre una alerta crítica nueva. §2.2 queda
  resuelto casi entero.
  **Lo que NO se hizo de §2.2/§2.1**: el **loop dedicado 3/15 min del lado
  agente** (`agent/src/core/TaskScheduler.ts`) — las alertas del agente (EWS/
  `prtAlertTable`) siguen refrescando en el loop de supplies (60/240 min), lo que
  cambió es que el *servidor* ahora abre/resuelve/notifica bien lo que le llega,
  no la frecuencia con la que el agente lo recolecta; el **digest diario** de
  notificaciones (resumen batch, no implementado); el **modelo unificado de
  umbrales** cliente→agente→dispositivo (siguen 3 umbrales de "offline"
  distintos: 5 min agente, 30 min dispositivo, más uno en `localStorage` del
  portal); y la normalización de `prtAlertTable` más allá de lo que ya llegaba
  (el agente ya decodifica esa tabla y la manda como `AlertItem[]` — lo que
  faltaba era el lado servidor, que es lo que se cerró acá).

- ✅ **Reportes por cliente** (commit `1e056a1`): selector de período, cierre
  mensual inmutable (lectura inicial/final, delta, método/fuente, `superseded_by`
  al reabrir), export CSV/XLSX, y entrega automática por email/webhook (mismo
  transporte de notificaciones de Fase 1). §2.5 queda resuelto.
  **Lo que NO se hizo de §2.5**: export a PDF (quedó CSV/XLSX), entrega por SFTP.
- ✅ **Identidad de dispositivo por cliente** (commit `2d4eef5`): clave compuesta
  `(client_id, serial)` en vez de `(agent_id, serial)` — dos agentes viendo la
  misma impresora ya no la duplican; decommission (soft-delete + reactivar),
  mover entre agentes/clientes (con confirmación explícita si cambia de
  cliente), merge manual de duplicados (historial de lecturas sumado, el
  registro fuente queda como lápida vía `merged_into`), editar nombre/ubicación
  con override. §2.4 queda resuelto.
- ✅ **SNMPv3 + lista de credenciales por agente** (esta pasada): v1/v2c/v3
  (MD5/SHA-2, DES/AES) con lista de hasta 8 credenciales por agente probadas en
  orden por el agente hasta que una responda; secretos cifrados at-rest
  (AES-256-GCM, clave derivada con HKDF-SHA256) en `agents.snmp_credentials`;
  reorder/renombrar/borrar sin re-tipear contraseñas (referencia opaca por
  `id`); optimistic locking (`snmp_credentials_rev`) contra dos pestañas del
  portal pisándose; `snmp_community` legado sigue viajando siempre en el
  heartbeat para agentes sin actualizar. Fail-fast del lado agente para que una
  lista larga no multiplique el timeout de escaneo de un host muerto (probado
  contra un agente SNMPv3 real simulado con `net-snmp`, no sólo con sesiones
  falsas). §2.3 (versiones y lista de credenciales) queda resuelto.
  **Lo que NO se hizo de §2.3, y queda para una pasada aparte** (ver ítem
  pendiente más abajo): resolución de hostname; credenciales por RANGO (esta
  pasada es por agente completo — el formato de alambre hacia el agente ya
  soporta extenderlo después sin tocar el agente); rotación de la clave de
  cifrado (el ciphertext lleva prefijo de versión `"v1:"` desde el día uno
  para no bloquearla, pero el mecanismo en sí no está implementado).
- ✅ **CIDR + tope de rango + exclusiones** (esta pasada): `ip_ranges` acepta
  bloques CIDR además de `start`/`end` manual, y una lista de IPs
  individuales a excluir por rango. El cloud compila todo (CIDR expandido,
  network/broadcast auto-excluidos, exclusiones aplicadas) a pares
  `{start,end}` planos antes de mandarlo al agente por el heartbeat — CERO
  cambios de parsing del lado agente, cero riesgo de romper agentes viejos.
  Corrige el bug real de escalabilidad de `ScanService.ts` (materializaba el
  rango completo en memoria sin límite): ahora hay un tope de 2000 IPs
  declaradas por agente, validado en cloud (`PUT /agents/:id/config` y
  `POST /agents` de alta) y reforzado en el agente como defensa en
  profundidad (nunca materializa de más, sin importar qué diga la config
  recibida). Warning no bloqueante si un rango incluye IPs públicas (probable
  error de tipeo). §2.1/§2.3 (rangos) queda resuelto.
  **Lo que NO se hizo**: exclusión de sub-rangos/CIDR anidados (sólo IPs
  individuales), resolución de hostname (ver arriba), IPv6.

- ✅ **Horario laboral y TZ configurables por agente** (esta pasada):
  `agents.business_hours` (jsonb nullable — `null` = default hardcodeado de
  siempre, Argentina L-V 8-18, cero cambio de comportamiento sin configurar)
  reemplaza el TZ/horario fijo de `BusinessHours.ts`; el mismo mecanismo
  (`Intl.DateTimeFormat` con `timeZoneName:'longOffset'`, sin librería nueva)
  también corrige el offset `-03:00` hardcodeado que `agentService.ts`
  forzaba al parsear timestamps naive `DD/MM/YYYY` de logs/lecturas de
  binarios de agente viejos — usa el TZ real configurado del agente
  (resuelto una vez por request en `agentAuth`, sin queries extra), anclado
  al propio timestamp parseado (no a "ahora", evita un error de 1h cerca de
  una transición de DST con backlog). §2.1/§3 R7 queda resuelto.
  **Lo que NO se hizo**: cosmética de locale en el portal (`es-AR`,
  `formatDateAR` de reportes) — es un problema de visualización, no de
  corrección de datos, se deja para una pasada de polish aparte.
- ✅ **`scan_schedule` eliminado** (esta pasada, como remoción de código
  muerto — no como feature nueva): la columna (migración
  `20260823020000`), la interfaz `ScanSchedule`, y todo su manejo en
  `agentService.ts`/`portalAgentController.ts`/`portalAgentRoutes.ts` y el
  duplicado huérfano en `shared/types.ts`. Historia reconstruida vía git log:
  se implementó de punta a punta el 23/05 y se reemplazó deliberadamente 4
  días después (`6298b9e`) por el modelo de 3 loops + horario laboral —
  ese commit limpió agente/portal pero nunca el backend. No había ningún
  spec vigente que pidiera que un scheduler tipo cron conviviera con el
  horario laboral recién cerrado, así que no se reimplementó. §2.1 (fila
  "Scheduler custom") queda resuelto.
- ✅ **Resolución de hostname (point lookup) + credenciales SNMP por rango**
  (esta pasada, último ítem de Fase 1): `ip_ranges` acepta un tercer
  discriminante `{hostname}` — el cloud NO resuelve (sin visibilidad de la
  DNS interna del cliente), el agente resuelve por `dns.lookup()` en cada
  ciclo de discovery (sin cache, `family:4`, timeout explícito de 4s propio
  — `dns.lookup()` no tiene timeout nativo y corre sobre el mismo threadpool
  de libuv que `fs`) y trata la IP resuelta como cualquier otra descubierta;
  las reasignaciones DHCP se resuelven solas vía la deduplicación por serial
  ya existente. Cada entrada de `ip_ranges` (rango/CIDR/hostname) admite
  `credential_ids?: string[]` — referencia a la lista existente de
  `agents.snmp_credentials`, restringe qué credenciales prueba el agente en
  ESE rango durante discovery (meter/supplies siguen con el pool completo:
  `known_devices` no tiene vínculo a rango, y un dispositivo ya conocido
  casi siempre acierta con la credencial cacheada sin necesitar fail-fast).
  IDs colgantes se resuelven fail-open al pool completo en
  `agentService.getConfig()`; rangos superpuestos con credenciales distintas
  y borrado de una credencial todavía referenciada generan warnings no
  bloqueantes. §2.1/§2.3 quedan resueltos — **Fase 1 completa**.
  ✅ **UI de asignación de `credential_ids` en el portal** (25/08/2026):
  `CredentialIdsSelect.tsx`, nuevo componente chico (chips toggle, ninguno
  activo = pool completo) usado desde `IpRangesEditor` — visible en los dos
  lugares donde se edita `ip_ranges` (`MonitorDetail`/`ConfigTabPanel` y
  `ConfigAgentModal`), sólo si el agente tiene credenciales SNMP
  adicionales configuradas. Verificado de punta a punta contra el stack
  real: cargar 2 credenciales por API, togglear una en el selector,
  guardar, y confirmar por API que `ip_ranges[0].credential_ids` persistió
  con el id correcto.
  **Lo que NO se hizo**: resolución de solapamiento de rangos en runtime
  (sólo warning al guardar).

### Fase 2 — Diferenciación — arrancada: 5 de 7 ítems cerrados
✅ **API pública con API keys por cliente + webhooks de integración ERP**
(23/08/2026): `api_keys` (hash SHA-256 at-rest, nunca el valor en claro;
gestión desde el portal — `POST/GET/DELETE /clients/:id/api-keys`, admin/
operator) + `api_webhooks` (una fila por cliente, no por key, para que rotar
una key no rompa la suscripción; firma HMAC-SHA256 vía header
`X-STC-Signature`). Endpoints nuevos bajo `/api/v1/public/` (`devices`,
`devices/:id/readings`, `alerts`, `reports/closures`, `webhook`), scope
SIEMPRE fijo al cliente de la key (controladores propios, no reusan
`scope.ts`/`getScope` — pensado para `PortalUser`, no para este actor
distinto), rate-limit propio de 60/min por key. Webhooks salientes reusan el
guard SSRF ya existente de `notificationService.ts` (`postWebhook`) tal
cual, sin reescribirlo — enganchados en `notificationWorker.ts`/
`reportDeliveryWorker.ts` (alertas/cierres, mismo patrón defensivo de releer
por id) y un worker nuevo (`publicWebhookWorker.ts`, lecturas, un webhook
por BATCH de sync, no por lectura individual). §2.3/tabla comparativa "API
pública / ISV" queda resuelto.
✅ **UI de portal** (23/08/2026): `ApiKeysCard.tsx` en `ClientDetail.tsx` —
crear/listar/revocar API keys (modal "mostrar una sola vez") y configurar
el webhook (url, eventos, ver/regenerar secret). De paso se cerró un hueco
real que no tenía este ítem: `GET/PUT /clients/:id/webhook` nuevo del lado
cloud, porque el webhook sólo se podía configurar antes autenticado con una
API key ya existente (huevo y gallina para un cliente nuevo). Verificado
con Playwright real contra el stack Docker (login, crear key, ver el
secret, configurar webhook) — capturas revisadas antes de commitear.

**Lo que NO se hizo**: expiración automática de keys (retry con backoff
para webhooks fallidos ✅ 25/08/2026, ver Fase 8; documentación pública tipo
OpenAPI/Swagger ✅ 26/08/2026, ver Fase 9 — `docs/api/openapi.yaml`).

✅ **Mejoras de agente** (23/08/2026), 5 de 6 ítems del roadmap, verificados
con tests reales salvo el marcado (c):
- **Rollback de update** — ✅ **verificado contra Windows real** (23/08/2026,
  vía interop WSL2 sobre el Windows real del usuario): el bundle single-file
  ahora guarda `.bak` + `.bak.version` ANTES de reemplazar (`UpdateService.ts`,
  antes reemplazo in-place sin ningún respaldo); `rollbackToPreviousVersion()`
  restaura. Corrida la clase compilada real (`dist/core/UpdateService.js`,
  no una réplica) contra una COPIA del `bundle.js` real de la instalación
  existente (`C:\Program Files\STC\Monitor\bundle.js`, 723.621 bytes) en un
  directorio aislado (`C:\Temp\stc-rollback-test`, nunca la instalación
  viva) — backup, "actualización" simulada rota, y rollback restauraron el
  archivo original byte a byte. El parche ZIP (`.bat`/robocopy, Windows-only)
  ahora también hace un backup de `installDir` antes del robocopy destructivo
  — red de seguridad MANUAL (un admin restaura a mano), no rollback
  automático (ese flujo corre fuera del proceso Node, sin nadie vivo para
  decidir revertir después) — esta parte NO se probó en runtime (requeriría
  tocar el servicio real, fuera del alcance acordado).
- **Activación offline**: `activate()` reintentaba una sola vez y fallaba
  (exit 3) si no había red al momento de instalar, dejando el servicio en
  `SERVICE_DEMAND_START` indefinidamente. Ahora reintenta con backoff
  (5s/15s/30s/60s) SÓLO ante error de red — una key inválida/revocada sigue
  fallando de inmediato, sin reintentar en vano.
- **Dedupe de lecturas idénticas** (`sync/database.ts`,
  `shouldEnqueueReading`/`recordLastReadingSnapshot`): antes se encolaba
  TODA lectura de meter/supplies sin comparar contra la anterior (el "72
  filas/día" de un equipo ocioso, R3). Ahora sólo se manda si cambió algo
  relevante (contadores/tóner) o pasaron 4h desde el último envío (para no
  perder la señal de "sigo vivo").
- **Detección de PJL deshabilitado** (`snmp/pjl.ts`): antes un fallo de PJL
  se trataba igual que cualquier método sin datos, sin log específico. Ahora
  cuenta fallos consecutivos por IP y loguea un WARN al llegar a 3
  (firewall/driver bloqueando el puerto 9100, o firmware con PJL apagado).
- **"Mantener datos" al desinstalar** (`installer/STC-Monitor.iss`) — ✅
  **compilación verificada contra Inno Setup 6.7.1 real** (23/08/2026, vía
  interop WSL2): antes `[UninstallDelete]` borraba `config.enc`/`local.db`/
  logs siempre, sin excepción. Ahora `InitializeUninstall` pregunta y sólo
  borra `DataDir` si el usuario no eligió conservarlo. Compilado con
  `ISCC.exe` real ("Successful compile") — la sintaxis Pascal nueva
  (`InitializeUninstall`/`KeepUserData`/`NotKeepingData`) es válida. **Lo que
  falta**: correr una instalación/desinstalación real de punta a punta (no
  se hizo — tocaría la instalación existente del usuario o requeriría
  redirigir el `.iss` a una carpeta de prueba, fuera del alcance acordado
  para esta pasada).
- **Log rotation real** (`core/Logger.ts`): antes un solo nivel (`.1` se
  pisaba en cada corte). Ahora rota en cadena hasta 5 archivos, borrando el
  más viejo (mismo criterio que logrotate).
**Lo que NO se hizo**: dedupe de lecturas del loop de discovery (sólo
meter/supplies — discovery corre cada 10-60 min, dedupear ahí aporta menos);
detección de PJL deshabilitado no distingue firewall vs firmware apagado,
sólo loguea "no responde"; rollback automático (auto-detección de "la nueva
versión crasheó, revertir sola") — sólo restauración manual/on-demand.
136/136 tests de agente verdes (112 previos + 24 nuevos).

✅ **Agregados continuos** (23/08/2026): `readings_daily_agg`/
`readings_monthly_agg` (TimescaleDB continuous aggregates, migración
`20260823050000`) — último valor de contadores/tóner por dispositivo por
día/mes, con `add_continuous_aggregate_policy` (refresh cada 1h/6h) y
`materialized_only=false` (agregación en tiempo real; default de esta
versión de TimescaleDB es `true` — sin esto una lectura recién insertada
quedaba invisible hasta el próximo refresh, encontrado corriendo la
migración real). **Sólo visualización**, deliberadamente NO reemplaza la
lógica de deltas con detección de `counter_reset` de `reportService.ts`
(demasiado stateful/secuencial para un agregado continuo; replicarla mal acá
arriesgaría números de facturación sutilmente incorrectos) — `report_closures`
sigue siendo la única fuente de verdad de facturación. Nuevo endpoint
`GET /devices/:id/usage-history?granularity=daily|monthly` (scope por
cliente, agregado a `CLIENT_VIEWER_ROUTES` — mismo criterio que
`/readings`), sobrevive a la retención de 2 años sobre `readings` crudo (el
agregado ya materializado no depende de la fila cruda). **Lo que NO se
hizo**: dashboard de portal consumiéndolo (deliberado, otra sesión estaba
trabajando en simultáneo sobre `cloud/portal/`); no es de lectura inmediata
(hasta 1h/6h de lag según el `schedule_interval` de cada policy, a
diferencia de `/readings` crudo). 288/288 tests de cloud verdes.

✅ **Remote EWS por túnel sobre el WSS existente** (23/08/2026): proxy
SÍNCRONO de un GET a la EWS de un dispositivo específico, sin sesión de
túnel persistente — reusa el canal de comandos WS ya existente
(`sendCommandToAgent`), pero resuelto vía un mapa de resolvers en memoria
(`ewsProxyService.ts`) en vez de `broadcastToPortal` (que manda cualquier
`command_result` a TODOS los portales admin/operator conectados — un
Plan-agent detectó que usarlo acá filtraría contenido de la EWS de un
cliente a cualquier admin conectado en simultáneo, no sólo a quien lo pidió).
Opt-in explícito por agente (`agents.remote_ews_enabled`, default `false`,
imitando que HP SDS lo tiene desactivado por defecto), toggle auditado
aparte del uso (`REMOTE_EWS_TOGGLE` vs `REMOTE_EWS_ACCESS`, nunca el body
completo en `audit_logs`). Allowlist en dos capas: cloud resuelve la IP
ACTUAL desde `devices` (nunca una IP tipeada a mano) y rechaza si
`last_seen` es más viejo que 2x el intervalo de scan (ventana de staleness
por reasignación DHCP); agente re-valida contra su `known_devices` local
antes de tunelear (`CommandHandler.ts`, fail-closed si no está configurado).
GET-only forzado en ambas capas — mismo principio ya documentado en la
comparativa v1.0 ("STC Cloud sólo hace GET de lectura, no modifica
configuración"). Descarga con tope de tamaño (2MB) cortado en streaming
(no post-buffer, que sí podía inflar memoria sin límite antes) — body
en base64, nunca `toString('utf8')` (una EWS con imágenes se corrompía).
`EWS_PROXY` deliberadamente NO está en el enum del comando genérico
(`/agents/:id/command`) — la única vía es el endpoint dedicado
`POST /agents/:id/ews-proxy`, con su propia validación. Verificado en vivo
con una conexión WS real simulando el agente (no un mock) — round-trip
completo, error del agente, agente offline, staleness, flag apagado.
✅ **UI de portal** (23/08/2026): toggle en `ConfigAgentModal.tsx`, guardado
independiente del botón "Aplicar Configuración" (sin el problema de
optimistic locking que sí tienen SNMP credentials/business hours). De paso
se encontró y corrigió un bug real: `listAgents()` (usado por `GET /agents`,
lo que alimenta la tabla del portal) tenía su propio `select()` sin
`remote_ews_enabled` — el toggle siempre arrancaba en "Deshabilitado" sin
importar el valor real. Verificado con Playwright real (login, abrir modal,
confirmar que lee "Habilitado" de un agente que ya lo tenía así, togglear).

**Lo que NO se hizo**: paridad completa con IMIL (MIB walk remoto,
deshabilitar monitoreo por equipo, reenviar lecturas, descubrir IP puntual
— sólo se implementó el acceso EWS en sí); separación de roles entre quien
activa el flag y quien lo usa (ambos son admin/operator sin distinción,
señalado como límite conocido, no un consentimiento explícito del cliente
como sugiere HP SDS). 313/313 tests de cloud, 146/146 de agente.

Ítems de Fase 2 que siguen sin tocar: backend multi-réplica — parcialmente
arrancado. ✅ (23/08/2026) logs estructurados: `console.log/warn/error`
reemplazado por un logger `pino` compartido (`cloud/src/logger.ts`) en los 13
archivos de jobs/servicios/boot que lo usaban; Fastify sigue con su propio
pino interno (mismo `LOG_LEVEL`) — pasarle la instancia externa vía
`loggerInstance` rompe la inferencia de tipos de `FastifyInstance` en las
funciones `registerXRoutes`. El resto sigue sin tocar: WS con registro de
sockets **en memoria** (`ws/index.ts:24-25`), `heartbeatMonitor.ts` como
`setInterval` **a propósito** (ver comentario en el archivo), y sin métricas
Prometheus ni Sentry — todos requieren una decisión de arquitectura del
usuario, no se tocan sin eso.
**Nota (23/08/2026, tras la migración a self-hosted)**: el riesgo original de
`heartbeatMonitor.ts` (Redis de producción con `maxmemoryPolicy: allkeys-lru`
en `render.yaml`, evictando en silencio las claves de un repeatable job) ya no
existe — producción dejó Render, y el Redis self-hosted actual
(`docker-compose.prod.yml`) no fija ningún `maxmemory-policy` (default sin
eviction). Comentario del archivo corregido para no citar una config que ya
no aplica.
**Decisión (23/08/2026)**: dejarlo como está de todos modos. Hoy corre un solo
`api` service sin réplicas en ambos `docker-compose*.yml` — nada obliga hoy a
multi-réplica, y convertir `heartbeatMonitor` a BullMQ repeatable ahora mismo
no aportaría ningún beneficio real todavía (sin el riesgo de eviction de por
medio, tampoco hay urgencia en evitarlo). Se retoma el día que haya una razón
concreta para correr más de una réplica de la API — ese día conviene el
advisory lock de Postgres (`pg_try_advisory_lock`) mencionado en el
comentario del archivo, más simple que resolver una cola.
También sigue sin tocar: familias de marcas nuevas
(Ricoh/Kyocera/Brother/Xerox/Canon/Konica — siguen cayendo a `generic` o con OIDs
parciales, §3 R8; requiere hardware real para captura/fixtures, no completable
sin acceso a equipos reales). ✅ (23/08/2026) Documentación: comparativa v2.0,
inventario de datos y auditoría IT ya reescritos — falta sólo el DPA
(documento legal, no técnico, deliberadamente no redactado).

### Fase 3 — Paridad con HP SDS Manager LATAM (gap analysis 23/08/2026) — completa: 11 de 11 ítems cerrados
Origen: comparación en vivo del portal contra HP SDS Manager LATAM (dashboard,
listado de dispositivos, consumibles, alertas, incidentes) — 8 gaps concretos,
desglosados en 11 fases de implementación. Plan completo en
`/home/ivan/.claude/plans/silly-napping-planet.md`.

✅ **Diccionario de alertas → motivo + clase** (23/08/2026): `alerts.type` recibía
códigos de vendor crudos sin traducir (`prtAlertCode` RFC 3805 como entero-string,
bits `HR-<n>` de `hrPrinterDetectedErrorState`, códigos Samsung EWS tipo
`C2-1411`/`S2-3313`/`M1-5612`) — nunca se resolvían a texto legible ni a una
categoría. Nuevo `cloud/src/services/alertCatalog.ts` (puro, sin Knex/Fastify):
`classifyAlert(type, message)` clasifica en cascada (tipos internos exactos →
`prtAlertCode` → bits `HR-*` → familia/código de vendor → fallback saneando el
mensaje crudo) a una de 14 clases estilo SDS (`alert_class`) + motivo en español
(`alert_reason`, ≤120 chars) + quién debe actuar (`responder`, 5 niveles). Migración
`20260824010000_alerts_classification_and_origin.ts` agrega esas 3 columnas más
`origin` (`'cloud'`|`'device'`) a `alerts` — **metadata derivada, `alerts.type`
queda intacto** como clave de dedupe de los índices únicos parciales existentes —
y corre el backfill sobre las filas ya existentes (`origin`, `alert_class`,
`alert_reason`, `responder` calculados; 0 filas quedan con `alert_class IS NULL`
tras correrla en el stack de desarrollo).

De paso, dos bugs reales encontrados y corregidos: (1) **auto-resolución
indebida** — `resolveStaleEwsAlerts` (ahora `resolveStaleDeviceAlerts`) usaba una
blocklist (`NON_EWS_RESERVED_TYPES`) que no protegía `device_error` ni
`device_still_reporting`, así que cualquier sync con alertas EWS los cerraba sin
querer; reemplazada por un allowlist positivo (`origin='device'`), que cierra la
clase de bug entera en vez de la instancia — verificado con test de regresión
end-to-end (`alerts.test.ts`, decommission de un equipo + dos syncs EWS
consecutivos, confirma que `device_still_reporting` sigue abierta mientras la
alerta EWS vieja sí se auto-resuelve). (2) **dos escritores para el mismo
concepto** — `alertWorker.ts` abría `device_error`/`critical` por lectura,
`heartbeatMonitor.ts` abría `device_offline`/`warning` por staleness, posturas
contradictorias sobre el mismo hecho (una notificaba por mail, la otra no);
unificado a `device_offline`/`warning` en los dos escritores (la migración
renombra las filas históricas — irreversible a propósito, documentado en el
`down()`).

Endpoints nuevos: `GET /alerts/classes` (catálogo estático) y
`GET /alerts/summary` (desglose por clase + severidad, scopeado), ambos en
`CLIENT_VIEWER_ROUTES`; `GET /alerts` gana filtro server-side `alert_class`
(CSV, 400 si algún valor no matchea el catálogo) y `responder`, reemplazando el
filtro client-side de `Alerts.tsx` que filtraba la página ya paginada (bug
estructural: con >50 alertas activas, filtrar por clase devolvía casi vacío).
El LEFT JOIN triple + scoping de `getAlerts` se extrajo a
`buildScopedAlertQuery()` en `dashboardController.ts`, reusado por el summary.
58/58 tests de `alertCatalog.test.ts` (nuevo, unitario puro) + `alerts.test.ts`
verdes; 65/65 de `rbac.test.ts` verdes (incluye 2 casos nuevos: `client_viewer`
puede leer `/alerts/classes` y `/alerts/summary`, scopeado a su propio cliente).
Verificado migrando y corriendo contra el stack Docker real (no sólo tests).

✅ **UI de alertas** (23/08/2026): `Alerts.tsx` reescrito — se borró
`categoryOf()`/`CATEGORY_LABELS`/el `useMemo` que filtraba la página ya
paginada (el bug estructural de arriba) y se reemplazó por el filtro
server-side (`alert_class` como query param, opciones cargadas de
`GET /alerts/classes`). Columnas nuevas: **Código** (`type` en monospace),
**Motivo** (`alert_reason`, con el mensaje crudo del vendor en el tooltip),
**Clase** (badge coloreado por familia — rojo: agotado/fallo/atasco, ámbar:
bajo/advertencia/acción de usuario, slate: informativo, azul: disponibilidad)
y **Acción** (`responder`). Contador de cabecera desde `GET /alerts/summary`
("632 · 439 críticas · 193 advertencias"). Deep-link vía `useSearchParams`
(`/alerts?class=jam&resolved=false`) — leído al montar y sincronizado de
vuelta a la URL, listo para que el panel del dashboard (siguiente ítem) linkee
directo a una clase filtrada. `types/alerts.ts` extendido con los campos
nuevos como opcionales (compatibilidad con filas de un deploy rodante).
Verificado con Playwright real contra el stack Docker (login, filtro por
"Soporte bajo" con datos reales de un HP LaserJet — HR-0/807 traducidos a
"Papel bajo"/"Papel bajo en la bandeja", clase "SOPORTE BAJO", acción "Sin
formación"): el filtro server-side devuelve las 5 filas correctas donde antes
(post-paginación, client-side) podía devolver una página casi vacía.
`npm run check` (íconos + tsc + eslint) y `npm run build` verdes.

**Lo que NO se hizo de este ítem**: el panel "alertas por clase" y el resto de
paneles nuevos de `Dashboard.tsx` — es la Fase 6 del plan (depende también de
Fase 5, `monitor_state`), deliberadamente separada.

✅ **Feed de "Movimientos y cambios"** (23/08/2026): `audit_logs` era write-only
por decisión de retención (23/08) — esa decisión era sobre RETENCIÓN, no
visibilidad; se preservó intacta (`retentionJob.ts` sigue sin tocar esta tabla,
cero UPDATE/DELETE nuevos) y se agregó lectura por primera vez. Migración
`20260824020000_audit_logs_client_scope_and_indexes.ts` agrega `client_id` +
3 índices, con backfill guardado por regex de UUID contra `metadata->>'client_id'`
y contra `devices`/`agents`/`clients` por `target_id` (2039 de 2407 filas
existentes resueltas; el resto queda sin cliente pero sigue siendo visible por
acción/fecha/target). Nuevo `cloud/src/services/auditService.ts`
(`writeAudit()`, punto único de escritura) y `auditCatalog.ts` (labels en
español + categoría para las ~30 acciones existentes, puro). Migrados a
`writeAudit()` los 7 inserts `DEVICE_*` de `deviceController.ts` y el
`DEVICE_MERGED` de `deviceLifecycleService.ts` — el resto (~19 call-sites en
`agentService.ts`, `authController.ts`, etc.) sigue insertando directo sin
`client_id`, documentado como pendiente de una pasada de limpieza aparte.

Endpoints nuevos `GET /audit-logs` (paginado con `total`, filtros
from/to/action/category/client_id/target_id/user_id) y `GET /audit-logs/actions`
(agregado, cache 60s), ninguno en `CLIENT_VIEWER_ROUTES` (admin/operator
solamente — mismo criterio que excluye `/agents/:id/logs`). UI: nueva página
`/activity` (nav "Movimientos", admin/operator) con fila expandible mostrando
el `metadata` crudo, y pestaña "Historial" en `DeviceDetail.tsx`
(`GET /audit-logs?target_id=`). Es la primera pantalla del portal con
paginación server-side real (`total` + offset/limit).

**Dos bugs reales encontrados y corregidos durante la implementación** (no
en el plan original, aparecieron al migrar contra el stack real): (1)
`knex.raw()` trata el operador jsonb `?` (`metadata ? 'client_id'`) como SU
PROPIO placeholder de binding — rompía el arranque del contenedor con
"syntax error at or near $1"; reemplazado por `jsonb_exists(metadata,'client_id')`.
(2) el backfill de `metadata->>'client_id'` confiaba ciegamente en el valor sin
validar que el cliente todavía existiera — filas de test/histórico con un
`client_id` huérfano (cliente ya borrado) violaban la FK nueva y tumbaban el
arranque; corregido con un `UPDATE ... FROM clients` que sólo asigna cuando el
cliente es real. Ambos verificados corriendo la migración completa contra una
copia real de la base de desarrollo (dry-run en una transacción con
`ROLLBACK`) antes de aplicarla en serio. 13/13 tests nuevos de
`auditFeed.test.ts` verdes (incluye el caso `client_viewer` → 403 en ambas
rutas), suite completa de 15 archivos sin regresiones. Verificado con
Playwright real: `/activity` con 2354 filas reales, filtro por cliente/acción/
categoría, fila expandible con metadata, y la pestaña "Historial" de un equipo
mostrando exactamente el movimiento que se le hizo.

**Bug no relacionado, corregido de paso a pedido del usuario**: el umbral de
"equipo sin señal" estaba hardcodeado en 3 lugares independientes (backend
`heartbeatMonitor.ts`, portal `constants.ts`, y un tercero — no documentado —
en `formatters.ts:getDeviceStatusInfo`, que es el que realmente pinta
"SIN CONTACTO" en `DeviceInventoryTable.tsx`) a 30 minutos, mientras el agente
reduce su propia frecuencia a **4 horas** fuera del horario laboral
configurado (`INTERVALS.meter.off`/`supplies.off`, `agent/src/core/BusinessHours.ts`).
Cualquier flota real aparecía "sin contacto" la mayor parte de cada franja
fuera de horario. Los tres umbrales se subieron a 5 horas (4h + 1h de margen)
y el de `formatters.ts` ahora importa la misma constante que `constants.ts` en
vez de tener la suya propia. Confirmado en el stack real: al reiniciar el
backend se auto-resolvieron 132 alertas `device_offline` indebidamente
abiertas; en el portal, un monitor de prueba pasó de mostrar 16/16 equipos
"sin contacto" a sólo los 4 que de verdad llevaban ~2 días sin reportar. Sigue
pendiente el "modelo unificado de umbrales cliente→agente→dispositivo" más
amplio ya señalado en Fase 1 de este roadmap — este fix sólo corrige el valor,
no unifica los tres lugares en uno solo.

✅ **Campos de inventario manuales y derivados** (23/08/2026): migración
`20260824030000_devices_inventory_fields.ts` — `asset_number` sigue el mismo
patrón `*_reported`/`*_override`/columna GENERADA que `name`/`location`
(nadie lo reporta todavía, eso es Fase 10); `asset_tag` es columna plana
(ninguna fuente automática lo reporta); `duty_cycle_monthly_override` por
equipo + tabla `device_models` (spec del MODELO, matcheada por
`lower(brand)`/`model_key` normalizado) para el catálogo; `custom_data` jsonb
+ tabla `custom_field_defs` (scope global o por cliente, tipos
text/number/date/select/boolean, tope de 25 campos vivos por cliente). Vista
`device_usage_30d` sobre `readings_daily_agg` (ventana móvil de 30 días,
mismo criterio anti-reset `SUM(GREATEST(delta,0))` que el volumen mensual del
dashboard) — cierra el pendiente declarado en Fase 2 ("el portal todavía no
consume los agregados continuos").

Nuevo `cloud/src/services/customFieldService.ts` (CRUD + `validateAndMerge`,
merge parcial por clave — nunca reemplaza `custom_data` entero) y endpoints
`clients/:id/custom-fields` + `device-models`, los `GET` en
`CLIENT_VIEWER_ROUTES`. `PUT /devices/:id` extendido con `asset_number`,
`asset_tag`, `duty_cycle_monthly`, `custom_data`. Los joins a
`device_usage_30d`/`device_models` se agregaron a `getDevice`
(`deviceController.ts`) y — hallazgo real durante la implementación — a
`getAgentDevices` (`portalAgentController.ts`), que es el endpoint que
efectivamente alimenta `DeviceInventoryTable.tsx`; `getClientDevices`
(`clientController.ts`, el que el plan original asumía) resultó no tener
consumidor en el portal, confirmado por la exploración previa.

UI: card "Inventario" nueva en `DeviceDetail.tsx` (Nº activo con badge
manual/reportado, Nº etiqueta, ciclos de trabajo con fuente, uso 30 días con
badge de % de utilización del ciclo), `EditDeviceModal` extendido con los 3
campos fijos + inputs dinámicos por tipo para cada campo personalizado,
columnas "Inventario"/"Uso 30d" nuevas en `DeviceInventoryTable.tsx` + CSV
extendido, y `CustomFieldsCard.tsx` nueva en `ClientDetail.tsx` (mismo patrón
que `ApiKeysCard.tsx`). 15/15 tests nuevos de `inventoryFields.test.ts`
verdes (incluye el caso real: 3 lecturas en 3 días → `pages_30d` = suma de
deltas positivos, verificado con el valor exacto 120). Verificado con
Playwright real: crear un campo personalizado "Costo por página color (USD)"
desde `ClientDetail`, confirmarlo en la lista, abrir "Editar equipo" y verlo
renderizado como input de texto listo para completar.

**Lo que NO se hizo de este ítem**: el estado de monitoreo granular (4
niveles estilo SDS) es la Fase 5 del plan, deliberadamente separada — hoy
`devices` no tiene ningún campo que exprese "sólo consumibles"/"sólo
informes"/"deshabilitado".

✅ **Estado de monitoreo granular** (23/08/2026): punto #7 exacto de la
comparativa (SDS: Totalmente habilitado / Solo consumibles / Solo informes /
Deshabilitado). Migración `20260824050000_devices_monitor_state.ts` —
`devices.monitor_state` (`full`/`supplies_only`/`reports_only`/`disabled`,
default `full`), **reemplaza el `devices.managed` boolean planteado
originalmente** (mismo concepto con menos granularidad; "gestionado" en el
dashboard se derivará como `monitor_state <> 'disabled'` cuando llegue la
Fase 6). No se reutiliza `active` — la ingesta lo pisa en cada sync, un valor
de operador se perdería en el próximo ciclo (mismo argumento que
`decommissioned_at`).

El guard real vive en un solo lugar: `alertService.openAlert` (única
primitiva de escritura de alertas) corta antes de insertar si el
`monitor_state` del equipo no es `full`/`supplies_only` — cubre
`alertWorker.ts`, `agentService.ts` y `heartbeatMonitor.ts` de una sola vez
sin tocarlos uno por uno. `alertWorker.ts` además corta temprano por
eficiencia (evita las queries de umbral de tóner). `reportService.ts`
excluye `supplies_only`/`disabled` del cierre mensual (con la limitación
documentada: sin historial de cuándo cambió el estado dentro del período, se
usa el estado ACTUAL). `agentService.syncReadings`: `disabled` no inserta en
`readings` ni actualiza contadores/tóner (sólo `last_seen`/`ip_address`/
`active`, para no perder la señal de "sigue vivo"); `supplies_only`/
`reports_only` procesan la lectura entera (lossless, criterio R1) — la
diferencia la hacen los guards de arriba sobre el estado ya persistido.

Nuevo `cloud/src/services/deviceMonitorService.ts` (`setMonitorState`, punto
único reusable por la Fase 9 cuando llegue la acción en bloque) y endpoint
dedicado `PUT /devices/:id/monitor-state` (no un campo más de
`PUT /devices/:id`, para audit `action` propio — `DEVICE_MONITOR_STATE_CHANGED`
nueva en `auditCatalog.ts`). Wire hacia el agente preparado: `agentService.getConfig()`
suma `device_policies: [{ip,state}]` (campo aditivo, mismo criterio que
`ip_hosts`) para cuando el agente lo consuma en la Fase 10 — el cloud sigue
siendo la única autoridad real mientras tanto.

UI: selector de estado en la cabecera de `DeviceDetail.tsx` (oculto para
`client_viewer`) + aviso contextual por estado, badge + columna "Monitoreo"
en `DeviceInventoryTable.tsx`. 11/11 tests nuevos de `monitorState.test.ts`
verdes, incluido un test estático de regresión (recorre `cloud/src` buscando
cualquier `db("alerts").insert(...)` fuera de `alertService.ts` — si alguien
agrega un segundo escritor en el futuro, este test lo detecta antes de que
se salte el guard en silencio). Verificado con Playwright real: cambiar el
selector a "Deshabilitado" muestra el aviso azul de inmediato y el contador
de páginas queda congelado en el último valor.

**Lo que NO se hizo de este ítem**: la acción en bloque
`POST /devices/bulk/monitor-state` es la Fase 9, deliberadamente separada —
`deviceMonitorService.setMonitorState` ya quedó listo para que esa fase la
reuse sin duplicar lógica.

✅ **Métricas de dashboard estilo SDS** (23/08/2026): en el mismo `Promise.all`
de `getDashboard` — (1) fix real: `agentsStats` no filtraba
`status='revoked'` (`offlineAgents` sí lo hacía), de ahí el "1/426" absurdo
comparado contra HP SDS; (2) `stats.agents.reporting` — agentes con al menos
un equipo con lectura en las últimas 24h, sobre `devices.last_seen` (no
`readings` crudo, para no encarecer el polling del dashboard); (3)
`stats.devicesUnmanaged` **derivado de `monitor_state='disabled'`** (Fase 5),
campo aditivo, sin cambiar la forma de `stats.devices`; (4) `agentVersions` +
`currentAgentVersion` — nuevo `cloud/src/services/agentVersionService.ts`
(`getPublishedAgentVersion`, lookup Redis→`local_settings.json`→env,
extraído del endpoint `GET /agents/version` de `authController.ts` para
reusarlo sin duplicar: **hallazgo real** — `cloud/src/version.ts` es la
versión del *servidor cloud*, no la del agente, el plan original apuntaba al
archivo equivocado); (5) `alertsByClass` reusando `buildScopedAlertQuery` de
la Fase 1; (6) `discovered.today/yesterday` reales (`devices.created_at` ya
es la fecha de descubrimiento) con `pendingTotal` en placeholder `0` hasta la
Fase 7.

UI: `StatCard` de Monitores ahora muestra "% reportando (24h)", Parque Global
suma "N no gestionadas" cuando aplica; dos paneles nuevos — "Resumen de
Alertas por Clase" (filas clicables a `/alerts?class=X&resolved=false`,
mismo mapa de colores por familia que `Alerts.tsx`) y "Versiones de Agente"
(badge "desactualizado" en las que no coinciden con `currentAgentVersion`).
`registerDashboardRoutes`/`createDashboardController` ganaron un parámetro
`redis` (antes no lo necesitaban) para el lookup de versión. 39 tests
(2 nuevos + regresión) verdes en `e2e.test.ts`, incluido uno que envuelve el
revoke de un agente dedicado con una lectura del dashboard antes/después
para probar el fix del bug de conteo. Verificado con Playwright real contra
datos reales: "1 no gestionadas", "68% reportando (24h)", panel de clases
con 8 categorías y sus conteos, panel de versiones con "1.0.0" (sin badge,
es la actual) vs "desconocida" (384 agentes, badge ámbar) — y el click en
una clase navega correctamente a `/alerts?class=availability&resolved=false`.

**Lo que NO se hizo de este ítem**: el tile de "Descubiertos hoy/ayer/N
pendientes" en la UI del dashboard es la Fase 7, deliberadamente separada —
el backend ya devuelve `discovered` con forma final, sólo falta mostrarlo y
llenar `pendingTotal` con datos reales.

✅ **Cola de registro de dispositivos** (23/08/2026): punto #7 del plan,
depende de la Fase 5 (reusa `monitor_state`/`onlyLiveDevices`). Decisión
central — **flag `registration_state` en `devices`** (no una tabla aparte):
duplicar la escalera de identidad (`deviceIdentity.ts`) en otro lado arriesga
crear un duplicado al "promover" un equipo. Migración
`20260824060000_device_registration_queue.ts` agrega
`clients.device_approval_required` (opt-in por cliente, default `false` —
ningún cliente existente cambia de comportamiento) y a `devices`:
`registration_state` (`'pending'|'registered'|'ignored'`, default
`'registered'`) + `registered_at/by`, `ignored_at/by`, `ignore_reason`, con
un `CHECK` de coherencia (`ignored` ⟺ `ignored_at IS NOT NULL`) y un índice
parcial `devices_pending_idx`. Dry-run en transacción contra la base real
antes de aplicarla (812 equipos existentes quedaron `registered`, cero
regresión), migró limpio en el stack Docker real.

`onlyLiveDevices()` (`deviceFilters.ts`) ahora exige también
`registration_state = 'registered'` — es la definición de "está en la
flota", cubre sus 20+ call-sites de una sola vez. `alertService.openAlert()`
extiende su guard de Fase 5 para que `pending`/`ignored` tampoco alerten.
`agentService.syncReadings()`/`registerDevices()` — nueva fila entra
`pending` si el cliente tiene el flag prendido; `ignored` corta la ingesta
igual que `disabled` (mismo camino, sólo actualiza `last_seen`/`ip`);
`pending` **no corta nada** — la lectura se procesa entera (lossless, mismo
criterio R1 que ya regía para `supplies_only`/`reports_only`), sólo queda
afuera de inventario/alertas/facturación. **Bug real encontrado y
corregido**: `reportService.computePeriodUsage` arma todo con `db.raw()` y
reescribe a mano el criterio de `billableDevices` (no puede llamar al
predicado del query builder) — el filtro de Fase 5 (`monitor_state`) estaba
ahí pero nadie lo actualizó con `registration_state`, así que un equipo
`pending` facturaba antes de ser aprobado. Fix: una condición más en el
`WHERE` del CTE `scoped_devices`. (De paso, mismo bug de sintaxis ya visto en
Fase 5: un comentario con backticks dentro del template literal SQL rompe
`tsc` — TS1005 — corregido sacando los backticks del comentario.)

Nuevo `cloud/src/services/deviceRegistrationService.ts` (`listPending`,
`registerDevices`, `ignoreDevices`, `unignore` — bulk hasta 500 ids,
`skipped` con motivo por id que no matchea, nunca un 500). Endpoints (ninguno
en `CLIENT_VIEWER_ROUTES`, deny-by-default): `GET/POST .../pending-devices`,
`.../pending-devices/register`, `.../pending-devices/ignore` en
`clientRoutes.ts`; `POST /devices/:id/unignore` en `deviceRoutes.ts`; `PUT
/clients/:id` extendido con `device_approval_required`. `GET /dashboard`
completa el placeholder de la Fase 6: `discovered.pendingTotal` ahora es un
`COUNT(*)` real (scopeado por cliente cuando aplica).

UI: nueva `pages/PendingDevices.tsx` (ruta `/pending`, admin/operator),
selector de cliente + búsqueda, tabla con selección múltiple y acciones
"Registrar"/"Ignorar" (esta última pide motivo en un modal, nunca en
blanco). Ítem de nav "Pendientes" con badge de contador (poll cada 60s sobre
`GET /dashboard`). Tile en `Dashboard.tsx` (sólo visible si
`pendingTotal > 0` — es una alerta accionable, no un panel más). Switch
"Registro de Dispositivos" en `ClientDetail.tsx` con link directo a la cola
del cliente.

17/17 tests nuevos (`pendingDevices.test.ts`) verdes: sin regresión con el
flag apagado; con el flag prendido, un equipo nuevo queda `pending` (afuera
del inventario, visible en la cola, lectura persistida); segundo sync no
duplica; cierre mensual lo excluye; registrar/ignorar en bloque; ignorar
corta lecturas futuras y `unignore` las reanuda; validaciones (sin
`deviceIds`, >500 ids, id inexistente → `skipped` no error); RBAC 403 para
`client_viewer` en las 4 rutas nuevas. Suite completa de CI (18 archivos)
verde sin regresiones. Verificado con Playwright real contra el stack
Docker: badge "4" en el nav, tile del dashboard, cola con datos reales,
modal de "Ignorar" con motivo requerido, switch en `ClientDetail.tsx`.

**Lo que NO se hizo de este ítem**: el seam para "zona" del equipo
(`zoneId` en el register) quedó como no-op documentado — la tabla `zones` no
existe todavía en este repo; el endpoint acepta el parámetro pero no lo usa,
no bloquea el resto de la fase.

✅ **Superficie de consumibles** (24/08/2026): el detalle de insumos ya era
más rico que HP SDS (`devices.supplies_details` jsonb con SKU, serial de
cartucho, páginas restantes) — el gap era de SUPERFICIE (vivía sólo en
`DeviceDetail.tsx`, cálculo client-side), no de captura. **Corrección real al
plan**: la migración `20260824040000_devices_cartridge_printed_and_estimated.ts`
que el plan pedía **no hizo falta** — investigado antes de escribirla, las 12
columnas (`cartridge_capacity_*`/`cartridge_printed_*`/`cartridge_estimated_*`)
ya existían desde `20260521100000_add_toner_pages_stats.ts`/
`20260520120000_add_cartridge_data_to_devices.ts`, una sesión anterior a este
gap analysis. Lo que sí era real: el **bug de persistencia** que el plan
señalaba — el payload del agente ya mandaba esas 12 columnas (pasa el schema
Ajv de `agentRoutes.ts`) pero `agentService.syncReadings` nunca las escribía
ni en el UPDATE ni en el INSERT de `devices`, quedaban `NULL` para siempre.
Fix de una línea por columna en los dos bloques.

Puerto 1:1 de la lógica de `lib/supplies.ts` (client-side) a
`cloud/src/services/suppliesService.ts` — misma forma de filas
(`buildSupplyRows`), para que exista una sola implementación del cálculo.
`usageRatesFor(db, deviceIds)` reusa la vista `device_usage_30d` de la Fase 4
(`SUM(GREATEST(delta,0))` sobre `readings_daily_agg`, mismo criterio
anti-reset que el volumen mensual) en vez de reimplementar el cálculo de
deltas — una sola query para N dispositivos, nunca N+1; el ritmo diario se
deriva como `pages_30d/30` (ritmo de 30 días, no el ritmo instantáneo entre
las 2 lecturas más separadas que usa `DeviceDetail.tsx`). `fleetSupplies`/
`suppliesSummary` filtran por `alertableDevices` (vivo + `monitor_state` en
`full`/`supplies_only`, Fase 5) — un equipo `disabled`/`reports_only` no debe
aparecer en la vista de flota, mismo criterio que ya aplica
`alertService.openAlert` para las alertas de tóner del mismo equipo.

Endpoints nuevos, ambos en `CLIENT_VIEWER_ROUTES` (sólo lectura, scopeados):
`GET /devices/:id/supplies` (`{rate, rows}`, agregado a `deviceController.ts`
junto a `getDeviceReadings`) y `GET /supplies` + `GET /supplies/summary`
(`suppliesController.ts`/`suppliesRoutes.ts` nuevos, `client_viewer` siempre
forzado a su propio cliente). `fleetSupplies` arma las filas en memoria sobre
un techo de seguridad de 3000 dispositivos vivos (mismo criterio que
`listClients`/`listAgents`/`listDevices`) — no hay forma barata de filtrar
por `kind`/`percentage`/`remainingDays` en SQL cuando la fuente es jsonb, así
que se filtra/ordena/pagina en JS después de una sola query de dispositivos +
una sola query de ritmos. `/supplies/summary` cachea 60s por scope (mismo
patrón que `auditController.ts`).

UI: nueva `pages/Supplies.tsx` (ruta `/supplies`, todos los roles), filtros
por cliente (admin/operator)/tipo/urgencia, export CSV. Ítem de nav
"Consumibles". El widget "Consumibles en Alerta" del dashboard **se
mantiene tal cual** (deliberado, no es lo que decía el plan original): está
alimentado por `alertService` (abre/cierra con los umbrales reales por
agente, `warning`/`critical`), más preciso que un top-5 derivado de
`supplies_details` — reemplazarlo por `/supplies/summary` habría sido una
regresión de precisión. En su lugar se agregó un link "Ver todos los
consumibles" que lleva a la página nueva. `DeviceDetail.tsx` **tampoco migró**
al nuevo endpoint (otra corrección al plan): ya tiene las lecturas cargadas
para el gráfico de esa misma pestaña (sin costo extra), y su ritmo
calculado sobre la primera/última lectura visible es más preciso para UN
equipo que el promedio de 30 días que usa la vista de flota — dos fuentes
del MISMO cálculo base (`buildSupplyRows`, portado 1:1), pero cada una con
el `UsageRate` que le conviene a su escala (uno, muchos).

10/10 tests nuevos (`supplies.test.ts`) verdes: rate.totalPerDay/remainingDays
coherentes tras 3 lecturas en 3 días distintas + refresh manual del
continuous aggregate; filtro `max_days`; filtro `kind`; equipo
`monitor_state=disabled` no aparece en la flota; regresión del fix de
`cartridge_capacity/printed/estimated` (ya no quedan NULL); scoping por
cliente (`client_viewer` y device de otro cliente → 404); summary no cuenta
un ítem por encima de los umbrales. Suite completa de CI (19 archivos)
verde sin regresiones. Verificado con Playwright real contra el stack
Docker: 407 ítems reales de flota con SKUs/niveles/páginas restantes,
filtro por "Tóner", link desde el dashboard.

**Lo que NO se hizo de este ítem**: los dos puntos anteriores (dashboard y
`DeviceDetail.tsx` sin migrar al endpoint nuevo) son decisiones deliberadas,
no pendientes — documentadas arriba con su motivo.

✅ **Acciones en bloque** (24/08/2026): patrón ya existente en
`decommissionStaleDevices` (dryRun, una sola fila de audit con la lista de
ids) generalizado a selección explícita. **Corrección real al plan**: el
prerrequisito de "extraer `decommissionDevice`/`recommissionDevice`/
`moveDevice` a `deviceLifecycleService.ts` para que single y bulk compartan
función" no se hizo tal cual — los tres single-device ya hacen `forUpdate()`
+ validaciones puntuales sobre UN equipo (forma fila-a-fila), mientras que
bulk necesita "clasificar N ids en applied/skipped con una query, un UPDATE
en lote" (forma por lote) — son dos formas de acceso a datos genuinamente
distintas; forzar una firma común hubiera degradado una de las dos a peor
rendimiento sin ganar claridad real. En su lugar, `deviceLifecycleService.ts`
gana 3 funciones ADITIVAS (`bulkDecommission`, `bulkRecommission`,
`bulkMove`) con su propia clasificación por lote, documentando la decisión
en el propio archivo. `bulkSetMonitorState` sí reusa `deviceMonitorService.
setMonitorState` (loop de a uno, cada llamada ya valida y audita) — ahí el
prerrequisito del plan aplicaba tal cual porque esa función ya era unitaria
y barata de loopear.

Semántica de bulk, uniforme en las 4 acciones de dispositivos: nunca 404/400
para todo el lote por un solo id problemático — cada id se clasifica en
`applied` o `skipped` (con motivo: `not_found`, `merged`,
`already_decommissioned`, `not_decommissioned`, `same_agent`, `collision`,
`confirm_required`) y la respuesta siempre es `{count, applied, skipped}`.
`bulkMove` detecta colisión de serial contra el cliente destino con una sola
query para todos los elegibles (no una por dispositivo); un cambio de
cliente sin `confirmClientChange` no aborta el lote — sólo ese dispositivo
queda `skipped` (a diferencia del endpoint single, que sí devuelve 400 para
toda la request — divergencia deliberada: bulk favorece "aplicar lo que se
pueda" sobre "todo o nada"). `POST /alerts/bulk` (nuevo, junto a `updateAlert`
en `dashboardController.ts` — no en `alertService.ts`, que es la primitiva de
escritura del lado dispositivo/sistema, un concepto distinto de "un operador
reconoce/resuelve desde el portal") acepta sólo ids explícitos, nunca "todo
lo que matchea el filtro actual" — un usuario nunca reconoce/resuelve algo
que no llegó a ver.

Ninguna de las 5 rutas nuevas (`POST /devices/bulk/decommission|recommission|
move|monitor-state`, `POST /alerts/bulk`) entra a `CLIENT_VIEWER_ROUTES`,
deny-by-default. UI: nuevo hook `useRowSelection.ts` (selección genérica,
no se auto-limpia al paginar/filtrar — el caller decide cuándo) + componente
`BulkActionBar.tsx` (barra sticky, oculta si la selección está vacía),
reusados por las tres tablas seleccionables. `DeviceInventoryTable.tsx` gana
checkboxes + 4 acciones (Dar de baja/Reactivar/Mover/Estado de monitoreo,
con 4 modales nuevos en `DeviceLifecycleModals.tsx` que reusan el chrome
`BrandModal`/`ConfirmationModal` ya existente) — el botón "Dar de Baja
Desconectados" existente se mantiene aparte, es una acción por filtro de
inactividad, no por selección. `Alerts.tsx` gana checkboxes + Reconocer/
Resolver, sólo sobre la página visible. `Supplies.tsx` gana checkboxes +
"Exportar selección" (sin mutación — no tiene sentido "dar de baja" un
consumible).

29/29 tests nuevos en `deviceLifecycle.test.ts` (dryRun no muta; confirmación
da de baja N con una sola fila de audit verificada vía `/audit-logs`;
reintentar sobre los mismos ids → `already_decommissioned`; reactivar un
equipo no dado de baja → `not_decommissioned`; mover con colisión de serial
→ uno aplica, el otro `skipped`; cambio de cliente sin confirmar → `skipped`,
no aborta el lote; `state` inválido → 400 antes de escribir nada) + 5 tests
en `alerts.test.ts` (`POST /alerts/bulk` ack/resolve, id inexistente →
skipped, validaciones) + 5 en `rbac.test.ts` (403 para `client_viewer` en
las 5 rutas nuevas), todos verdes. Suite completa de CI (19 archivos) verde
sin regresiones — confirmado corriéndola completa después de que ejecuciones
sueltas repetidas del mismo archivo tropezaran con el rate-limit global de
100 req/min por IP del propio stack (no una regresión real, artefacto de
research manual). `npm run check`/build limpios en cloud y portal. Verificado
con Playwright real contra el stack Docker: barra de 4 acciones + modal de
estado de monitoreo en `DeviceInventoryTable.tsx`, barra Reconocer/Resolver
en `Alerts.tsx`, barra Exportar selección en `Supplies.tsx`.

✅ **Agente v1.1.0** (24/08/2026): única release que concentra los tres
puntos del plan, versión bump `1.0.0` → `1.1.0` (`agent/src/core/version.ts`,
`package.json`, `installer/STC-Monitor.iss`, `monitor-ui/STC.Monitor.UI.csproj`
— `build-installer.bat` ya traía su propio mecanismo de sincronización
interactivo de estos mismos tres archivos, no hizo falta tocarlo).

**10.1 — Honrar `monitor_state`/`registration_state` del lado agente**:
nuevo `AgentConfig.devicePolicies?: Array<{ip, state}>` (aditivo, mismo
patrón `!== undefined` que `ip_hosts`/`snmp_credentials`/`business_hours` ya
usan en `HeartbeatService.handleRemoteConfig`). Nuevo `core/devicePolicy.ts`
— `policyFor(config, ip)`, fail-open a `'full'` ante estado ausente o
desconocido (un bug de matching nunca deja de monitorear un equipo). En
`ScanService`: `captureAndRecord` (discovery) corta en `disabled`/`ignored`
sin loguear (mismo silencio que el resto de los early-return de esa función);
`runMeterTask` salta `supplies_only`/`disabled`/`ignored`; `runSuppliesTask`
salta `reports_only`/`disabled`/`ignored`. El cloud sigue siendo la única
autoridad real (ya filtraba en Fases 5/7); esto sólo ahorra tráfico SNMP y
CPU del agente contra equipos que el cloud va a descartar igual.

**10.2 — Detección de consumible no original**: nuevo `capture/supplyOrigin.ts`
— `classifySupplyOrigin(text)`, clasificador brand-agnostic (no hardcodea
"HP": el `generic-printer-mib.ts` que lo consume primero es multimarca por
SNMP) por regex multilingüe (en/es/pt) sobre frases tipo "Non-HP"/
"non-genuine"/"remanufactured"/"compatible"/"clon" vs "genuine"/"original";
`null` — nunca `'genuine'` — cuando no hay señal clara. Conectado en
`prtMarkerSuppliesDescription` (RFC 3805, universal — la fuente con más
cobertura real de la flota), `hp-futuresmart.ts` (`SupplyState` del EWS) y
`samsung.ts` (`status` de SyncThru, best-effort declarado — sin fixture real
de un cartucho no-Samsung para validar el texto exacto). **Bug real
encontrado durante la implementación**: `bridge.ts` (`fromEwsData`/
`mergeResults`) copia campo-a-campo el `SuppliesItem` en vez de spread —
agregar `origin` a la interfaz no alcanzaba, había que sumarlo explícito en
los dos lugares o se perdía en el camino EWS→`CaptureResult` (atrapado por
el test nuevo de `normalize.toDeviceReading`, no por inspección). Roll-up
peor-caso de los 4 tóners en `normalize.ts` → `reading.supply_origin`
(nuevas columnas en `readings_queue`/upload payload, mismo patrón que los 12
campos de cartucho de la Fase 8).

Cloud: migración `20260824070000_devices_supply_origin.ts`
(`devices.supply_origin`/`supply_origin_at`, `CHECK` de valores válidos),
dry-run + aplicada contra el stack real. `agentRoutes.ts` (`syncSchema`)
acepta `supply_origin` opcional. Nuevo `services/supplyOrigin.ts` —
`resolveSupplyOrigin(explicit, suppliesDetailsRaw)`: usa el campo explícito
si vino (agente 1.1.0+), si no deriva del jsonb (agente viejo que sólo manda
`supplies_details`) — la flota puede estar parcialmente actualizada sin
perder la señal. `agentService.syncReadings` persiste el campo (nunca lo
resetea a `null` si un sync no trae señal) y abre/resuelve
`alerts.type='supply_non_genuine'` (severidad `warning`, catálogo ya
clasificado en `alertCatalog.ts` desde la Fase 1) en la transición, tanto
para un equipo existente como para la primera lectura de uno nuevo.

**10.3 — `AssetNumber` por EWS (HP FutureSmart)**: `parseFsDeviceInformation`
agrega `assetNumber` a `DeviceExtraInfo` (fixture real,
`DeviceInformation.html:99`, campo case vacío como en la mayoría de los
equipos reales). Fluye a `supplies_details.device.assetNumber` sin tocar
`bridge.ts` (`device` ya se mergeaba genérico). `agentService.syncReadings`
llena `asset_number_reported` desde ahí — nunca `asset_number_override`, un
operador que ya seteó el override manual del portal no lo pierde porque el
equipo empezó a reportar algo (verificado con test: override sobrevive a un
sync posterior).

UI: badge "No original" en `DeviceDetail.tsx` (tab Consumibles) y
`DeviceInventoryTable.tsx` (columna Tóner), visible sólo cuando
`device.supply_origin === 'non_genuine'`.

31/31 tests nuevos: 28 en `supplyOrigin.test.ts` (tabla de casos, incluidos
falsos amigos — "Black Cartridge HP CE390A" sin palabra de estado → `null`,
una frase adversarial con "genuine" y "Non-HP" a la vez → gana el negativo)
+ 3 nuevos en `capture.test.ts` (SNMP genérico) + 2 en `normalize.
toDeviceReading` (roll-up, y el bug real de `bridge.ts` que earlier fix
corrigió) + 6 en `devicePolicy.test.ts` (fail-open, matching por ip) — suite
completa del agente 185/185 verde. Del lado cloud, 7/7 en
`supplyOrigin.test.ts` nuevo (explícito del agente, derivado server-side,
transición resuelve la alerta, sync sin señal no pisa lo ya sabido,
asset_number_reported vs override) + suite completa de CI (20 archivos)
verde sin regresiones. `npm run build`/`tsc --noEmit` limpios en agente y
cloud, `npm run check` limpio en portal. Verificado con Playwright real
contra el stack Docker: badge "NO ORIGINAL" en la ficha del equipo y en la
tabla de inventario del monitor, `asset_number_reported`/override
coexistiendo correctamente en la columna Inventario.

**Lo que NO se hizo de este ítem** (documentado, no pendiente sin más):
- **ConsumableConfigDyn.xml (HP legado) y `parseHpSupplies`/
  `parseHpLegacyHtmlSupplies`** no ganaron clasificación de origen: usan un
  `EwsData` plano (sin `SuppliesItem` anidado) y no hay fixture real de
  ninguno de los dos para validar qué texto de estado exponen — inventar
  regex contra un formato no verificado era el mismo riesgo que el plan
  quería evitar con "nunca inventar OIDs". La cobertura real (SNMP genérico
  multimarca + FutureSmart EWS) ya cierra el caso que el plan señalaba como
  "la ventaja real".
- **Test de integración de `ScanService.scan()`/`captureAndRecord` con un
  spy de que `disabled` no llama a captura** no se agregó: ninguna otra
  función de `ScanService` (`scan`, `runMeterTask`, `runSuppliesTask`) tiene
  test de integración hoy — sólo `credentialsForRange`, pura y exportada, la
  tiene. `policyFor` (la función nueva) se testeó al mismo nivel que ese
  precedente (`devicePolicy.test.ts`, puro). Cablear un mock completo de
  `sync/database` (better-sqlite3) + `capture/index` + `NetworkUtils` sólo
  para esto habría sido una excepción de andamiaje sin precedente en el
  archivo, no una regresión real: la lógica de skip en sí (3 líneas por
  callsite) es trivial y ya está cubierta transitivamente por
  `policyFor`.
- **"heartbeat con `device_policies` no rompe un agente 1.0.0"** se verificó
  por construcción (campo JSON aditivo que un cliente viejo simplemente no
  desestructura, mismo patrón exacto que `ip_hosts`/`snmp_credentials` en su
  momento), no ejecutando el binario 1.0.0 real contra el heartbeat nuevo
  (no hay forma de correr ese binario en este entorno).

✅ **Módulo de incidentes** (24/08/2026): último de los 8 gaps. Frontera dura
entre **alerta** (estado técnico crudo, la abre/cierra la máquina — única
escritura `alertService.ts`, se auto-resuelve sola) e **incidente** (unidad
de trabajo de servicio, la abre/cierra una persona o una regla opt-in, con
Nº legible/SLA/aging, y sobrevive a que la alerta subyacente se auto-resuelva).
Cerrar un incidente nunca resuelve alertas y viceversa; se vinculan por tabla
puente `incident_alerts`. El ack/resolve existente sobre `alerts` no se tocó.

Migración `20260824080000_incidents.ts`: secuencia `incidents_number_seq`
(arranca en 100000, números legibles tipo ticket), tabla `incidents`
(snapshot denormalizado de serie/etiqueta del equipo al abrir, mismo criterio
que `report_closure_lines`), `incident_alerts` (puente) e `incident_events`
(timeline: comentario/cambio de estado/asignación/vínculo/reapertura).
Anti-duplicado de incidentes **automáticos** vía índice único parcial
`incidents_open_device_class_uniq ON incidents (device_id, class) WHERE
status<>'closed' AND origin='auto'` — mismo patrón que
`alerts_device_type_open_uniq`. Migración `20260824090000_incident_rules_seed.ts`:
tabla `incident_rules` (opt-in por clase de alerta, `client_id` nullable con
override de cliente sobre la fila global), sembrada con 8 clases globales,
**todas `enabled=false`** — cero incidentes automáticos al desplegar sobre
una base existente.

Backend: `incidentService.ts` (CRUD completo, `closeIncident` idempotente,
`reopenIncident` devuelve 409 con el id en conflicto si ya existe un
automático abierto para el mismo equipo+clase), `incidentClassifier.ts`
(único acoplamiento con la Fase 1 — usa `alert.alert_class` si está, si no
cae a un mapa de fallback sobre `alert.type`), y `incidentWorker.ts` (nuevo,
`setInterval` cada 2 min, mismo criterio no-BullMQ que `heartbeatMonitor`/
`retentionJob`): por tick, agrupa alertas abiertas que cumplen una regla
`enabled` en un solo incidente por `(device, class)` — 5 apariciones del
mismo atasco terminan en un ticket, no en 5 — respetando el override de
cliente sobre la regla global, `delay_minutes` (anti-flapping) y
`auto_close_on_alerts_resolved`. Reusa la cola existente `notifications-queue`
(job `incident.created`, sin transporte nuevo) y suma `incident.created`/
`incident.closed` a `api_webhooks`. `retentionJob.ts` excluye de la purga de
12 meses las alertas ligadas a un incidente no cerrado.

**Bug real encontrado y corregido de paso**: `notificationWorker.ts` procesaba
todos los jobs de `notifications-queue` como si fueran de alerta
(`job.data.alertId`) sin mirar `job.name` — al reusar la cola para
`incident.created` habría intentado resolver un alertId inexistente en
silencio. Corregido con dispatch explícito por `job.name` antes de que el
bug se manifestara en producción.

Endpoints: `GET/POST /incidents`, `GET /incidents/stats`, `GET/PATCH
/incidents/:id`, `POST /incidents/:id/{status,close,reopen,comments,assign}`,
`POST/DELETE /incidents/:id/alerts[/:alertId]`, `GET/PUT
/clients/:id/incident-rules`. Aging (`EXTRACT(EPOCH FROM COALESCE(closed_at,
now())-opened_at)`) calculado siempre al leer, nunca almacenado — mismo
criterio que `utilization_pct` de la Fase 4. `scope.ts` gana
`incidentIdParamMatchesScope` (mismo patrón 404-no-403 que
`deviceIdParamMatchesScope`); sólo los 3 `GET` de listado/detalle/stats en
`CLIENT_VIEWER_ROUTES`. `GET /alerts` gana `incident_id`/`incident_number`
por alerta (subquery, no LEFT JOIN, para no duplicar filas si una alerta
llega a vincularse a más de un incidente).

UI: `pages/Incidents.tsx` (listado paginado server-side con filtros
cliente/estado/clase), `pages/IncidentDetail.tsx` (timeline, alertas
vinculadas, cerrar/reabrir/asignar/comentar), `components/incidents/
CreateIncidentModal.tsx` (prellenado desde una alerta puntual),
`components/clients/IncidentRulesCard.tsx` en `ClientDetail.tsx`. `Alerts.tsx`
gana botón "Crear incidente" por fila (o badge enlazando al incidente ya
vinculado); `DeviceDetail.tsx` gana tab "Incidentes"; `Dashboard.tsx` gana
tile "N incidente(s) abierto(s)".

19/19 tests nuevos de `incidents.test.ts` (incluye una espera real de hasta
180s a un tick del worker — no mockeada ni acortada — para el caso de
agrupación automática de dos alertas de la misma clase en un solo incidente,
y el caso de reapertura con colisión → 409), extendido `rbac.test.ts` con 7
casos 403 nuevos. Suite completa de CI (21 archivos) verde sin regresiones.
Verificado con Playwright real contra el stack Docker: listado con 9
incidentes reales, detalle con timeline completo, badge "Incidente #100013"
vs botón "Crear incidente" distinguidos por el `title` del elemento (mismo
ícono, dos estados), tab Incidentes de un equipo, tile del dashboard, y
`IncidentRulesCard` reflejando la regla habilitada durante los tests.

Con este ítem se cierran los 11 de 11 ítems de la Fase 3 — los 8 gaps del
gap analysis del 23/08/2026 quedan todos atendidos (ver "Lo que NO se hizo"
de cada ítem para lo que deliberadamente quedó fuera de alcance).

### Fase 4 — Re-comparación exhaustiva contra el SDS real (24/08/2026) — completa: 6 de 6 ítems cerrados

Origen: segunda navegación en vivo del portal HP SDS Manager LATAM
(read-only, 36 pantallas: portal completo, gestión de clientes/activos/
consumibles/incidentes, los 9 informes enlatados + personalizados +
configurados, base de datos de productos, y las 5 pantallas de
administración; más búsquedas ejecutadas con datos reales y el detalle de
un equipo con sus 9 pestañas), hecha después de cerrar la Fase 3 para
verificar si quedaba algún gap suelto.

**Veredicto sobre lo ya cerrado**: las 11 fases aguantan la re-comparación
columna por columna — dashboard, diccionario de alertas (clase/gravedad/
formación/código/motivo), cola de registro, movimientos y cambios, modelos,
campos personalizados, monitor_state (los 4 estados exactos), consumibles
de flota, acciones en bloque de portal, eliminados, incidentes (clases,
estados, ID externo, tiempo activo) y búsqueda global. Sin regresiones de
paridad detectadas.

**Gaps nuevos detectados** (ordenados por peso de negocio; los dos primeros
son los únicos grandes):

✅ **4.1 — Informes guardados y programados con entrega por email**
(24/08/2026). El SDS tiene ~61 informes personalizados por categoría y una
pantalla de "informes configurados" con **55 filas reales en uso**
(contadores mensuales por cliente, equipos sin conexión semanales, niveles
de consumibles) con frecuencia diaria/semanal/mensual/días hábiles y envío
por mail; stc-cloud no tenía nada programable.

Implementado como el primer dominio de negocio nuevo bajo la architecture
guide: `cloud/src/modules/scheduled-reports/{domain,application,
infrastructure,presentation}/` (plantilla `modules/feedback/`), migración
`20260824100000_scheduled_reports.ts` (tabla con CHECKs de tipo/formato/
frecuencia, `next_run_at` precomputado por `computeNextRunAt` — dominio
puro, testeado determinista — e índice parcial `scheduled_reports_due_idx`
para la query del worker), worker `jobs/scheduledReportsWorker.ts`
(`setInterval` 60s, mismo criterio que `incidentWorker`; guard de
reentrada para SMTP lento; un fallo por fila queda en `last_run_status`/
`last_run_error` sin frenar el resto del tick).

5 tipos de informe que cubren lo que el equipo real más usa en el SDS:
`usage` (contadores del período, reusa `computePeriodUsage`),
`non_contactable`, `consumable_levels` (reusa `fleetSupplies`, tope 200
filas declarado en `truncated`), `asset_list` y `alert_history` — cada uno
como builder chico en `infrastructure/renderers/`, codificados por un
`tabular-export.ts` genérico (CSV con BOM UTF-8 / XLSX vía exceljs, mismo
estilo que `reportExportService`). El envío reusa el transporte SMTP
existente (`notificationService.sendMail`, que ya no-opea sin `SMTP_HOST`).
Endpoints CRUD + `POST /:id/run` (ejecutar y enviar ya) + `GET /:id/download`
(generar y descargar sin enviar); ninguno en `CLIENT_VIEWER_ROUTES`
(deny-by-default, mismo criterio que `/audit-logs`). UI: página nueva
`/scheduled-reports` ("Informes", nav admin/operator) con alta/edición/
ejecutar/descargar/eliminar y aviso de próxima/última corrida.

Verificado: 17/17 tests nuevos (`scheduledReports.test.ts`: unitarios
deterministas de `computeNextRunAt` — daily/weekdays salta finde/weekly/
monthly — más e2e de CRUD, validaciones 400, descarga CSV con cabecera y
XLSX con firma ZIP real, run-now registra `last_run` y recalcula
`next_run_at`) + 2 casos 403 nuevos en `rbac.test.ts`; suite CI completa
(22 archivos) verde; `tsc`/`check:sizes`/`npm run check`/build del portal
limpios; verificación visual Playwright contra el stack Docker real
(modal de alta y fila creada con próxima corrida bien calculada al lunes
siguiente a las 08:00).

**Lo que NO se hizo de este ítem**: constructor de columnas configurable
por informe (el SDS deja elegir columnas; acá cada tipo tiene su set fijo),
zona horaria por usuario (R7, la hora programada es hora local del
servidor — documentado en la migración), y periodicidad por minuto/hora
(la granularidad es la hora, como el caso de uso real).

✅ **4.2 — Ciclo de pedidos de consumibles** (24/08/2026). Todo el módulo
"Gestión de consumibles" del SDS es un pipeline de *solicitudes* con 6
estados; stc-cloud mostraba niveles pero no tenía concepto de "pedido". Es
el dominio que hoy resuelve `sdsinsumos` contra el SDS.

Implementado como segundo dominio bajo la architecture guide
(`cloud/src/modules/supply-requests/`): migración
`20260824110000_supply_requests.ts` (tabla `supply_requests` con estados
pendiente/consultada/procesada/completada/ignorada/cancelada — "eliminada"
del SDS mapeada a `cancelled`, acá no se borran filas —, snapshot
denormalizado del equipo, `supply_request_events` como timeline, opt-in
por cliente `clients.supply_requests_enabled` default false + umbral
configurable 1–99%, y **anti-duplicado de pedidos automáticos** por
(equipo, consumible) vía índice único parcial, mismo patrón que
`incidents_open_device_class_uniq`). Dry-run en transacción con ROLLBACK
antes de aplicar.

Worker `jobs/supplyRequestWorker.ts` (`setInterval` 2 min, mismo criterio
que `incidentWorker`): por tick abre pedidos para consumibles bajo el
umbral del cliente (reusa `suppliesService.fleetSupplies` — un solo cálculo
de niveles/días en todo el sistema) con dedup por el índice, y
**auto-completa** pedidos abiertos cuando el nivel sube ≥30 puntos sobre el
nivel de apertura (señal de cartucho reemplazado — el mismo criterio que
usa `sdsinsumos`; el margen evita falsos positivos por rebote de lectura).
Un pedido cerrado no se reabre: si sigue bajo umbral, el próximo tick abre
uno nuevo. Notificaciones por la `notifications-queue` compartida (jobs
`supply_request.created`/`.completed` despachados por `job.name` en
`notificationWorker.ts` — el dispatch por nombre ya existía desde el fix de
la Fase 11), email al `notification_email` del cliente y eventos nuevos
`supply_request.created`/`.completed` en el union de `api_webhooks`.

Endpoints: `GET/POST /supply-requests`, `GET /supply-requests/stats`,
`GET /supply-requests/:id` (con timeline), `POST /:id/status` (transiciones
validadas en dominio puro — flujo feliz pendiente→consultada→procesada→
completada, ignorar/cancelar desde cualquier abierto, cerrado no
transiciona → 409), `POST /:id/comments`, `GET/PUT
/clients/:id/supply-request-settings`. Los 3 GET en `CLIENT_VIEWER_ROUTES`
con ownership central (`supplyRequestIdParamMatchesScope`, patrón
404-no-403); mutaciones y config deny-by-default. UI: página "Pedidos"
(estados como pestañas con contadores, modal de detalle con timeline/
transiciones/comentarios), card "Pedidos Automáticos de Consumibles" en
`ClientDetail.tsx` (sobre la estructura recién dividida por la migración de
arquitectura) y tile en el dashboard.

Verificado: 20/20 tests nuevos (`supplyRequests.test.ts`: dominio puro de
transiciones y `replacementDetected`; e2e de settings/CRUD manual/
transiciones/409/timeline/stats; y **auto-creación + auto-completado con
dos ticks REALES del worker de 2 min** — 227s de espera real, sin mockear;
garantía de compatibilidad: el cliente sin opt-in no genera pedidos) + 2
casos 403 en `rbac.test.ts`; suite CI completa verde; `tsc`/`check:sizes`/
portal check/build limpios; verificación visual Playwright (tile del
dashboard, pestañas con datos reales, modal con timeline completo del
pedido del test, card de configuración).

**Lo que NO se hizo de este ítem** (documentado a propósito): lotes de
solicitudes y "Consumable Order Suggestions" del SDS (agrupamiento para
compra — tiene sentido recién con el catálogo de consumibles de 4.x/base
de productos), botón de alta manual en la UI (existe por API; el SDS
tampoco tiene alta manual real de solicitudes), y "solicitud de anulación
del umbral" por equipo (el umbral es por cliente en v1).

✅ **4.3 — Plantillas de mensajes editables + notificaciones por evento con
opt-out por cliente** (24/08/2026). El SDS configura notificaciones por
tipo de evento con activo/inactivo y alcance, y cada evento tiene
plantilla editable; stc-cloud tenía email/webhook por cliente con cuerpos
hardcodeados.

Implementado como tercer dominio bajo la architecture guide
(`cloud/src/modules/message-templates/`): migración
`20260824120000_message_templates_and_notification_events.ts` — tabla
`message_templates` (subject/body con placeholders `{{var}}` por evento;
`client_id` NULL = global, fila de cliente overridea la global — misma
precedencia que `incident_rules`; upsert con SELECT-then-INSERT/UPDATE
explícito por el índice de expresión, criterio ya documentado en
`upsertIncidentRule`) y `clients.notification_events` jsonb (opt-out por
evento, default TODOS los eventos = comportamiento histórico intacto).
Dry-run con rollback antes de aplicar.

Dominio puro (`renderTemplate` — placeholder sin valor → "—", nunca queda
`{{...}}` en el mail; `eventEnabledFor` — valor no-array → habilitado,
comportamiento histórico) con los 5 eventos: alert.created,
incident.created, supply_request.created/.completed, report.closed. Los
DEFAULTS calcan los textos hardcodeados que había en
`notificationService.ts` — sin fila en la base el mail sale byte a byte
igual que antes. `resolveTemplate` es best-effort: una plantilla rota o un
error de lectura caen al default, jamás frenan un envío.

Integración: los 4 senders de `notificationService.ts` ganan un param
opcional `content` (sin él, texto histórico); `notificationWorker.ts` y
`reportDeliveryWorker.ts` resuelven plantilla + chequean el opt-out del
cliente antes de mandar email/webhook propio (los webhooks de la API
pública no se tocan: ya tienen su propio filtro `events`). Endpoints
`GET/PUT/DELETE /message-templates` (vista efectiva por evento con
`source: default|global|client` y placeholders; DELETE del override
vuelve al nivel anterior), y `PUT /clients/:id` acepta
`notification_events` (validado por enum en el schema). Nada en
`CLIENT_VIEWER_ROUTES`. UI: card "Plantillas de Mensajes" en Configuración
(editor expandible por evento, chips de placeholders, restaurar default)
y card "Eventos Notificados" en la ficha del cliente.

Verificado: 13/13 tests nuevos (`messageTemplates.test.ts`: dominio puro
de render/opt-out + e2e de precedencia default→global→override→delete,
evento inválido 400, PUT/GET de `notification_events`, cliente nuevo
arranca con los 5 eventos) + 1 caso 403 en `rbac.test.ts` (82/82); suite
CI completa verde; dry-run de migración; `tsc`/`check:sizes` (baseline
regenerado por el crecimiento legítimo de los 3 archivos de integración,
procedimiento documentado del ratchet)/portal check/build limpios;
verificación visual Playwright de las dos cards contra el stack real.

**Lo que NO se hizo de este ítem**: umbral configurable de "monitor sin
conexión x N horas" como activador propio (el umbral de offline ya se
corrigió globalmente en la Fase 3 — 5h alineado al agente; hacerlo por
cliente entra en el "modelo unificado de umbrales" pendiente de Fase 1
del roadmap), alcance por distribuidor (no hay capa distribuidor, §2.6),
y editor de plantillas por cliente en la UI (el backend lo soporta vía
`client_id` en el PUT; la UI v1 edita solo las globales).

✅ **4.4 — Auditoría de correo** (24/08/2026). El SDS registra cada mail
enviado (log global filtrable + pestaña "Email Log" por equipo); stc-cloud
enviaba best-effort sin rastro consultable.

Implementado como cuarto dominio bajo la architecture guide
(`cloud/src/modules/email-log/`): migración `20260824130000_email_log.ts`
(tabla `email_log` con estados `sent`/`error`/`skipped_no_transport`/
`skipped_no_recipient` — **"no se mandó nada" también se audita**, que es
justo lo que un operador necesita cuando un cliente dice "no me llegó").
El registro vive en el único choke point de envío
(`notificationService.sendMail` + contexto `audit` opcional): los 5 flujos
lo adjuntan — alertas, incidentes, pedidos de consumibles, cierres
mensuales e informes programados (evento `scheduled_report` vía el
constructor del `SmtpReportMailer`). Escritura best-effort (un fallo del
log jamás frena una notificación) y purga a 12 meses en `retentionJob.ts`,
mismo horizonte que las alertas resueltas. Endpoint `GET /email-log`
(filtros cliente/evento/estado + búsqueda por destinatario/asunto), nada
en `CLIENT_VIEWER_ROUTES` (mismo criterio que /audit-logs). UI: página
"Correo" (nav admin/operator) con filtros y el error de envío en tooltip.

Verificado: 5/5 tests nuevos (`emailLog.test.ts` — e2e real: alerta
crítica por sync → fila `skipped_no_transport` con destinatario y
`alert_id` en metadata, filtros, 400 por estado inválido) + 1 caso 403 en
`rbac.test.ts` (83/83); dry-run+migración aplicada; `tsc`/`check:sizes`/
portal check/build limpios; verificación visual Playwright de la página
con filas reales (incluidos intentos "sin destinatario" de clientes sin
email configurado — la señal operativa clave).

**Lo que NO se hizo**: pestaña "Email Log" por equipo en la ficha (el log
global filtra por cliente y busca por asunto, que cubre el caso de uso; la
fila guarda ids en metadata para agregarla después sin migración) y
retención configurable (fija a 12 meses).

✅ **4.5 — Costes por equipo** (24/08/2026). La pestaña "Costes" del SDS
(coste de capital, alquiler trimestral, coste por página mono/color,
contrato de servicio) alimenta los "Extended Billing Figures" que el
equipo real usa masivamente.

Implementado como quinto dominio bajo la architecture guide
(`cloud/src/modules/device-costs/`, con facade `index.ts` al estilo
`modules/inventory`): migración `20260824140000_device_costs.ts` (tabla
1:1 `device_costs` — `devices` ya es ancha y esto es data administrativa
opcional; importes por página en numeric(10,4): un coste real es del orden
de $0,0227, dos decimales no alcanzan; CHECKs de no-negatividad).
`GET/PUT /devices/:id/costs` (PUT upsert de set completo), deny-by-default
(datos comerciales). Dominio puro `periodCost()` con la decisión de que
"sin dato" es null, no $0. **Integración con 4.1**: el informe de uso
programado agrega automáticamente las columnas Coste mono/color/total
cuando el cliente tiene al menos un equipo con costes cargados — los
billing figures del SDS salen del mismo informe que ya se programa y llega
por mail. UI: pestaña "Costes" en la ficha del equipo (sobre la estructura
de `components/devices/detail/` de la migración de arquitectura),
admin/operator.

Verificado: 9/9 tests (`deviceCosts.test.ts` — dominio puro con redondeo,
CRUD/upsert/validaciones/404, y el CSV del informe de uso incluyendo las
columnas de coste) + 2 casos 403 en `rbac.test.ts`; dry-run + migración
aplicada; checks limpios; visual Playwright de la pestaña con valores
reales.

**Lo que NO se hizo**: informe dedicado de amortización/TCO (capital +
alquiler + contrato se guardan y muestran, pero el único cálculo derivado
v1 es el coste por páginas del período) y multi-moneda real (campo
`currency` informativo, sin conversión).

✅ **4.6 — Acciones remotas en bloque** (24/08/2026). "Acciones de HP SDS
en bloque" del SDS: comandos remotos programables con historial de lotes
(nº, fecha programada, elementos, acción, estado incluido "Completado con
errores").

Implementado como sexto dominio bajo la architecture guide
(`cloud/src/modules/remote-actions/`) **sobre la infraestructura de
comandos que ya existía** (`agent_commands` + entrega por heartbeat + ack
success/error — cero cambios de agente): un lote agrupa N comandos de los
tipos que el agente 1.1.0 YA ejecuta (`RESCAN`, `FORCE_SCAN`, `RESTART`
del agente, `FORCE_UPDATE`) y les da programación + seguimiento agregado.
Migración `20260824150000_remote_action_batches.ts` (lotes con nº legible
por IDENTITY desde 1000, como el SDS; items 1-por-agente vinculados al
`agent_command`). Worker `jobs/remoteActionWorker.ts` (60s): despacha
lotes vencidos creando los comandos (re-entrante: no duplica en fallo
parcial) y reconcilia — dominio puro `aggregateStatus`: mientras quede un
comando pendiente el lote sigue "sent"; al terminar todos, `completed` o
`completed_with_errors`. Endpoints GET/POST `/remote-actions`, detalle con
estado por agente, y cancelación solo de lotes aún programados (409 si ya
se despachó — el despacho no se deshace). UI: página "Acciones" con lotes,
modal de creación (acción + selección de monitores + programación
opcional) y detalle por agente.

Verificado: 8/8 tests (`remoteActions.test.ts` — **ciclo completo real**:
crear lote → tick real del worker lo despacha (≤120s) → un "agente"
simulado por el endpoint real de heartbeat recibe el comando y devuelve el
resultado → el worker cierra el lote como `completed`; más cancelación de
programado vs 409 del despachado, 400 por agente revocado/inexistente) +
2 casos 403 en `rbac.test.ts`; dry-run + migración; checks limpios;
visual Playwright (lote completado y cancelado reales, modal de detalle).

**Lo que quedó fuera de esta fase** (cerrado después, ver Fase 7 — Agente
v1.2.0): el reinicio remoto de la IMPRESORA. "Comprobar/actualizar
credenciales" por equipo puntual sigue sin ítem propio (hoy las
credenciales SNMP se gestionan por rango, Fase 2).

**Parciales/menores anotados, sin ítem propio**: 2FA opt-in y zona horaria/
idioma por usuario (R7 ya abierto), catálogo de consumibles en la base de
productos (5.783 SKUs en el SDS; cobra sentido junto con 4.2), preferencias
de columnas por lista, foto del modelo en la ficha, contacto en el alta de
incidente, contador de páginas en la fila de alerta. La capa distribuidor
multi-reseller sigue documentada en §2.6 como decisión estratégica.

Los módulos "Soporte técnico de HP SDS" e "Informar de un problema a HP"
son propios del vendor y no aplican.

> Nota de implementación: a partir de esta fase el backend nuevo sigue
> `docs/dev/ARCHITECTURE_GUIDE.md` (dominios nuevos como
> `cloud/src/modules/<dominio>/{domain,application,infrastructure,presentation}`,
> plantilla: `modules/feedback/`; archivos ≤300 líneas, funciones ≤20,
> `npm run check:sizes` como guard).

### Fase 5 — Producción-readiness (24/08/2026) — completa: 4 de 4 ítems cerrados

Origen: con el gap vs SDS cerrado (Fases 3 y 4), el bloque de más valor que
quedaba eran los pendientes de la Fase 2 del roadmap ligados al riesgo R4
("diseño mono-instancia y operación"): métricas, error tracking y el camino
a multi-réplica.

✅ **5.1 — Métricas Prometheus** (`modules/metrics/`): endpoint `/metrics`
(registrado ANTES del rate limit para que el scraper no compita por el
presupuesto por IP; con `METRICS_TOKEN` definido exige Bearer — sin definir
queda abierto, aceptable porque el compose de producción no publica el
puerto de la API fuera de la red interna). Métricas propias:
`stc_http_request_duration_seconds` (por ruta DECLARADA con :params, nunca
la URL cruda — cardinalidad acotada), `stc_job_ticks_total` (ok/error/
skipped), `stc_job_tick_duration_seconds`,
`stc_job_last_success_timestamp_seconds` (para alertar jobs muertos),
`stc_ws_connections` (provider inyectado desde `ws/index.ts` para no crear
import circular) y `stc_queue_waiting_jobs` (profundidad de las 4 colas
BullMQ reales, con conexión propia que cumple los requisitos de BullMQ),
más las default de proceso.

✅ **5.2 — Sentry opt-in** (`modules/observability/sentry.ts`): activo solo
con `SENTRY_DSN` (sin DSN todo es no-op — desarrollo no cambia en nada).
Sin tracing de performance (Prometheus ya cubre latencias). Captura desde
el `setErrorHandler` de Fastify (preservando el comportamiento default al
re-lanzar) y desde el catch común de los jobs.

✅ **5.3 — Jobs replica-safe** (`modules/observability/guarded-tick.ts`):
los 6 jobs `setInterval` (heartbeatMonitor, retentionJob, incidentWorker,
supplyRequestWorker, scheduledReportsWorker, remoteActionWorker) pasan por
`runGuardedTick`: **advisory lock de Postgres** (`pg_try_advisory_lock`
con classid "STC" + FNV-1a del nombre) — si otra réplica corre el mismo
tick, este se saltea — más métricas y Sentry en un solo lugar. Es la
estrategia que el propio docblock de `heartbeatMonitor.ts` dejó prescripta
el 23/08 (lock barato por check, NO conversión a cola BullMQ) — se
implementó lo prescripto y se actualizó ese docblock. Los workers que ya
eran BullMQ (alertas, notificaciones, delivery de reportes, webhooks
públicos) ya eran replica-safe por naturaleza de cola.

✅ **5.4 — Pub/sub Redis para broadcasts WS** (`ws/index.ts`): todo
`broadcastToPortal` se publica al canal `stc:ws:portal` y CADA réplica
(incluida la que publicó) lo entrega a sus sockets locales al recibirlo
por la suscripción — un solo camino de entrega, sin duplicados; con Redis
caído, fallback a entrega local. **Límite documentado**: los canales con
afinidad de socket (push inmediato de comandos a un agente puntual, proxy
EWS) requieren la réplica dueña del socket del agente — el fallback
replica-agnóstico para comandos ya existe (entrega por polling de
heartbeat), y el proxy EWS en multi-réplica necesitaría sticky sessions o
un relay request/reply por Redis (fuera de alcance de esta fase).

Verificado: 8/8 tests nuevos (`observability.test.ts` — exclusión REAL del
advisory lock con dos conexiones Postgres separadas [una corre, la otra
se saltea, el lock se libera tras un error], auth de /metrics, e2e de
/metrics con todas las métricas propias y ticks ok de los jobs del boot, y
e2e de pub/sub: un publish al canal Redis llega hasta un cliente WS de
portal real autenticado por ticket); `tsc`/`check:sizes` limpios; deps
nuevas `prom-client` y `@sentry/node` (con el lockfile standalone de
`cloud/` regenerado — el repo raíz es workspace y `npm install` a secas no
lo toca, gotcha documentado acá). Suite CI completa de regresión corrida
tras el despliegue.

**Lo que NO se hizo**: habilitar multi-réplica real en los compose (los
locks y el pub/sub dejan el backend listo; el paso operativo — `deploy:
replicas` + LB — es decisión de infraestructura aparte), dashboards de
Grafana/alerting sobre las métricas (solo el endpoint), y el relay
request/reply para afinidad de socket del proxy EWS.

### Fase 6 — Seguridad (24/08/2026) — completa: 4 de 4 ítems cerrados

✅ **6.1 — 2FA TOTP opt-in para el portal** (anotado en los parciales de la
Fase 4 — el SDS lo ofrece en Preferencias — y ligado al riesgo R5).
Implementado como séptimo dominio bajo la architecture guide
(`modules/two-factor/`): TOTP RFC 6238 **puro sobre node:crypto, sin
dependencia externa** (~40 líneas auditables: HMAC-SHA1, paso 30s, 6
dígitos — los defaults que asumen Google Authenticator/Authy/1Password —,
base32 propio y comparación en tiempo constante), verificado contra los
**vectores oficiales del Apéndice B del RFC**. Migración
`20260824160000_users_totp.ts`: `users.totp_secret` **cifrado con
`cryptoService.encryptSecret`** (mismo mecanismo que las credenciales
SNMP, nunca en claro) + `totp_enabled`; un secreto con enabled=false es un
enrolamiento pendiente.

Flujo: `POST /portal/2fa/setup` (secreto + URI otpauth; con 2FA activo →
409), `enable`/`disable` **exigen un código vigente** (una sesión robada
no puede bajar el 2FA sin el teléfono), ambos auditados
(USER_2FA_ENABLED/DISABLED en el catálogo). Login: con el flag activo, la
contraseña sola devuelve 401 con `totp_required: true` (el portal muestra
el segundo paso) — y una contraseña INCORRECTA no revela `totp_required`
(sin oráculo de qué cuentas tienen 2FA). Las 4 rutas van en
`CLIENT_VIEWER_ROUTES`: proteger la propia cuenta es de todos los roles.
UI: card self-service en Configuración (clave manual copiable + URI
otpauth — sin QR visual a propósito, evita una dependencia nueva del
portal; toda app TOTP acepta clave manual) y segundo paso en el login.

Verificado: 13/13 tests (`twoFactor.test.ts` — vectores RFC, ventana ±1
paso, y el ciclo e2e completo: setup→enable con código real→login sin
código 401/con inválido 401/con válido 200→sin oráculo→setup con activo
409→disable→login vuelve a contraseña sola→auditado); verificación visual
Playwright del ciclo entero por la UI real (activación desde la card y
login con segundo paso, con el TOTP calculado en el script de prueba).

✅ **6.2 — Códigos de recuperación de 2FA** (24/08/2026). 10 códigos de un
solo uso (formato XXXXX-XXXXX sobre alfabeto sin ambiguos, ~48 bits de
entropía) generados al activar 2FA y mostrados UNA sola vez. En reposo van
**hasheados SHA-256** (nunca en claro; hash rápido correcto para secretos
de alta entropía del servidor — el costo de un KDF lento solo se justifica
contra secretos débiles). El login acepta un código de recuperación donde
iría el TOTP (`looksLikeRecoveryCode` los distingue por formato), con
**consumo atómico** (un código usado se marca `used_at` — no se borra:
auditabilidad de cuándo se quemó) y auditoría USER_2FA_RECOVERY_USED.
Regenerar el juego exige un TOTP vigente e invalida los anteriores
(auditado); disable limpia todo. `status` expone `recovery_remaining` y la
card lo muestra. Verificado: 18/18 tests (dominio puro + e2e: login con
recovery → 200, reuso → 401, regeneración invalida viejos, disable → 0
restantes).

✅ **6.3 — 2FA obligatorio por usuario** (24/08/2026). `users.totp_required`
gestionado por el admin (checkbox "Exigir 2FA" al crear/editar
operadores) en vez de un flag global por rol — más flexible y ya
suficiente para forzarlo en las cuentas admin si se decide esa política.
**Enforcement server-side en `authMiddleware`**: con el flag activo y sin
enrolar, la sesión pasa el login (necesita estar autenticada para poder
enrolar) pero cualquier ruta que no sea `/portal/2fa/*`, `/me` o `/logout`
devuelve 403 con `totp_enrollment_required: true` — no es un aviso de UI
salteable. `login` y `/me` exponen el mismo flag para que el portal
redirija. UI: banner ámbar global en el Layout con link a Configuración
mientras el flag esté pendiente.

Verificado: caso e2e nuevo (crear usuario forzado → login 200 pero
operación 403 → `/me` y `/2fa/*` accesibles → enrola → desbloqueado →
admin relaja el flag por PUT), 20/20 en el archivo completo. **Nota de
test-infra**: el archivo por sí solo hace >10 llamadas a `POST
/portal/login`, que tiene su propio rate-limit de 10/min
(`authRoutes.ts`) — no es un bug de producto, es el límite haciendo su
trabajo; se agregó un drenado explícito de esa key entre bloques del
archivo de test (documentado inline).

✅ **6.4 — Auditoría de logins** (24/08/2026). R5 señalaba "Audit logs
ausentes para: ... logins" — confirmado en el código: `portalLogin`
(`authController/session.ts`) no escribía ninguna fila de `audit_logs`,
a diferencia de casi todo el resto del portal. Se agregó `writeAudit` en
cada rama de salida: `USER_LOGIN_SUCCESS` al final (con el propio usuario
como `target_id`/`user_id`) y `USER_LOGIN_FAILED` en las 5 formas de
fallar (`unknown_user`, `disabled`, `bad_password`, `bad_totp`,
`bad_recovery_code`), con el motivo en `metadata.reason` — nunca la
contraseña ni el código, y con el username intentado en `metadata` aun
cuando el usuario no existe (permite investigar fuerza bruta por cuenta
sin que la fila tenga un `user_id`/`target_id` real). Catalogadas en
`audit-action-catalog.ts` bajo la categoría `security` (existía en el
tipo `AuditCategory` pero no se usaba todavía).

De paso, verificado contra el código (no sólo el doc, que estaba
desactualizado en varios puntos) que el resto de R5 ya estaba cerrado por
pasadas previas y no quedó fuera de foco: mass-assignment de `createClient`
y schema de `PUT /agents/:id/config` (Fase 0), IDOR (`scope.ts` con 13
call-sites de `*IdParamMatchesScope`, Fase 1), login por env en texto
plano (Fase 0), `x-forwarded-for`/`trustProxy` (Fase 0), firma del
updater con placeholder (cerrado 23/08, ver más abajo "R5" en Otros
puntos), comandos remotos individuales (`AGENT_COMMAND` ya auditado en
`portalAgentController/remote.ts`). Único hallazgo menor sin cerrar:
`triggerScan` (RESCAN disparado desde el detalle de agente, no desde
lotes) no audita — bajo riesgo (acción de sólo lectura) y no forma parte
de "logins", queda anotado para una pasada de limpieza aparte junto con
el cambio de versión de agente (`AgentTelemetryService.heartbeat` pisa
`agents.version` en cada latido sin registrar el cambio — habría que
comparar contra el valor previo para no auditar cada heartbeat).

Verificado: 3 tests nuevos en `auditFeed.test.ts` (login exitoso audita
con IP; contraseña incorrecta audita `bad_password` sin exponerla en
metadata; usuario inexistente audita `unknown_user` con `target_id` null)
+ regresión completa de la suite de audit feed (16/16) y del CI completo.

Con esto se cierra el corte de seguridad planificado del bloque 6.
**Pendiente para más adelante**: `triggerScan` sin auditar, auditoría de
cambio de versión de agente, y R6-R9 del doc (versionado disperso, TZ
fija, cobertura de marcas, portal sin paginación).

### Fase 7 — Agente v1.2.0 (24/08/2026) — completa: reinicio remoto de impresora

Origen: el único pendiente explícito que dejó la Fase 4.6 (acciones
remotas en bloque) — reiniciar la IMPRESORA (no el agente), la pieza de
"Acciones de HP SDS en bloque" del SDS que sí requería tocar el agente.

✅ **SNMP SET real, agente-side**. `SnmpClient.setInt()` nuevo en
`agent/src/capture/transport/snmp.ts` — mismo motor de negociación que ya
usa la lectura (misma pool de credenciales, sin "credencial de escritura"
separada: si la community/usuario que ya sirve para leer tiene permiso de
escritura en el device, el SET funciona; si no, se reporta explícito).
Clasifica el resultado en tres baldes según el `RequestFailedError`/
`RequestTimedOutError` real de `net-snmp` (nunca asume éxito ni falla en
silencio): `no-response` (timeout), `no-write-permission` (ReadOnly/
NoAccess/AuthorizationError/NotWritable — los 4 códigos ASN.1 que
significan "sin permiso"), `device-error` (cualquier otro rechazo de
protocolo, ej. valor fuera de rango). `agent/src/snmp/printerReset.ts`
dispara `prtGeneralReset` (OID **estándar** de Printer-MIB, RFC 3805,
`powerCycleReset`) — a diferencia del resto de los drivers de captura, no
hay fixture real posible para una escritura (no hay forma segura de
"simular" un SET contra hardware en este entorno); la seguridad la da la
clasificación de error de arriba, no un fixture.

`CommandHandler.ts` gana el caso `RESTART_PRINTER` con el mismo criterio
fail-closed que `EWS_PROXY` (IP fuera de `known_devices` → rechaza sin
tocar la red); `main.ts` inyecta el proveedor de credenciales
(`config.snmpCredentials` + `known_devices.snmp_cred_id` preferido, igual
que `ScanService`).

✅ **Cloud: destino por EQUIPO en los lotes**. Migración
`20260824190000_remote_action_items_device_scope.ts` — las 4 acciones
originales de la Fase 4.6 apuntan al agente; `RESTART_PRINTER` apunta a un
equipo puntual de su flota (`targetKindOf()` en el dominio decide qué pide
la creación). `remote_action_items` pasa de PK compuesta `(batch_id,
agent_id)` a `id` surrogate + índice único que tolera varios equipos del
mismo agente en un lote (`COALESCE` contra un UUID nil, mismo patrón que
`message_templates_scope_event_uniq`), con snapshot de `device_ip` al
crear (no la IP actual si cambió después). El worker arma el payload
`{ip: device_ip}` que el agente usa para el SET. UI: el modal de "Nueva
acción" cambia a selector cliente→equipos cuando la acción lo requiere,
con aviso explícito sobre el requisito de permiso de escritura; el detalle
del lote muestra el equipo en vez del agente para estos ítems.

Verificado: **200/200 tests del agente** (sin regresiones; nuevos:
`snmpSet.test.ts` — los 4 códigos de "sin permiso" clasificados correcto
con sesiones falsas inyectadas por el mismo seam que `snmpNegotiate.test.ts`,
más timeout y device-error distinguidos —, `printerReset.test.ts` — puerto
inyectado, confirma OID+valor —, `commandHandlerRestartPrinter.test.ts` —
mismo alcance que el precedente de `EWS_PROXY`: sólo la validación
agent-side, el SET real ya cubierto abajo). Del lado cloud, extendido
`remoteActions.test.ts` con el ciclo device-scoped completo (crear por
`device_ids` → item con `agent_id`+`device_ip` resueltos → el worker
despacha con el payload `{ip}` correcto → heartbeat lo entrega → se
simula un fallo real de permiso → lote `completed_with_errors`) + RBAC;
dry-run de la migración; `tsc`/`check:sizes`/portal check limpios.

**Release**: `agent/src/core/version.ts` → 1.2.0, sincronizado en
`agent/package.json`, `installer/STC-Monitor.iss` y
`monitor-ui/STC.Monitor.UI.csproj`. **Sin firmar**: la firma del bundle
(`sign-bundle.js`) y la corrida real del instalador Inno Setup requieren
Windows y las claves de firma — no verificables en este entorno Linux.
Código y tests quedan completos y verdes; falta el paso operativo de
firmar+empaquetar+publicar el release real, a cargo de quien tenga acceso
a esas claves.

### Fase 8 — Retry/expiración real de webhooks (25/08/2026) — completa

Origen: pendiente explícito de la Fase 2 ("API pública con webhooks —
falta expiración/retry automáticos"). Los 5 canales de entrega
(`alert.created`, `incident.created`, `report.closed`, `supply_request.*`,
`reading.created` de la API pública) ya encolaban con
`{attempts:3, backoff:{type:'exponential', delay:5000}}` desde que se
escribió el código original — el reintento nunca se había activado.

✅ **Dos bugs reales, ambos necesarios para que el retry funcionara de
verdad**: (1) `postWebhook` (`notificationService.ts`) nunca chequeaba
`res.ok` — `fetch` sólo rechaza la promesa ante una falla de RED, así que
una respuesta 4xx/5xx del receptor se trataba como entrega exitosa; (2)
`notificationWorker.ts`, `publicWebhookWorker.ts` y
`reportDeliveryWorker.ts` usaban `Promise.allSettled` + loguear los
rechazos sin relanzar nunca — el handler del job de BullMQ siempre
terminaba "bien" a ojos de la cola, así que el `{attempts:3,...}` ya
configurado jamás se disparaba. Se agregó `throwIfAnyRejected()` (mismo
patrón en los 3 workers, adaptado a cada mensaje de contexto) que relanza
si CUALQUIER canal falló, para que BullMQ reintente el job entero.
Trade-off aceptado: un reintento puede reenviar un canal que ya había
tenido éxito en el intento anterior (no hay tracking por canal dentro del
job) — mejor una notificación duplicada que una perdida silenciosamente,
mismo criterio que R1.

✅ **Cobertura de `{attempts,backoff}` completada en los 2 encolados que
no lo tenían**: `enqueueReadingWebhook` (`bullmq-ingest-queues.ts`, API
pública de lecturas) y `BullRequestNotifier.created()/completed()`
(`bull-request-notifier.ts`, pedidos de insumos) — antes encolaban sin
config, un intento único.

**Verificado en vivo contra el stack Docker real** (no sólo tests
unitarios): cliente con `notification_webhook_url` apuntando a un endpoint
público que siempre devuelve 500 (`httpbin.org/status/500`, guard SSRF
exige un receptor público real — no se puede apuntar a loopback), tóner
crítico real vía `/devices/sync` → logs de `stc_api` confirman **3
intentos reales** del job (`[NotificationWorker] Job N falló` x3, con el
backoff exponencial esperado entre cada uno) antes de agotar los
reintentos — comportamiento que antes del fix nunca ocurría (un solo log
de error y el job quedaba "exitoso" para BullMQ). Además, 3 tests nuevos
con `fetch` mockeado (`alerts.test.ts`, sin red — mismo criterio que el
resto del describe de guard SSRF) prueban `postWebhook` en aislamiento:
2xx resuelve, 4xx/5xx rechaza con el status en el mensaje. 35/35 tests de
`alerts.test.ts` verdes contra el contenedor rebuildeado; `tsc`/
`check:arch` limpios.

**No se hizo** (fuera de alcance de este pendiente puntual): tracking de
qué canal específico ya tuvo éxito dentro de un job con reintento (para
evitar el duplicado del trade-off de arriba) — requeriría partir cada
canal en su propio job, cambio de forma mayor no justificado por el
volumen actual; dead-letter queue o alerta al operador cuando un job agota
sus 3 intentos (hoy sólo queda en el log de `stc_api`) — quedó anotado
como posible mejora futura, no bloqueante.

### Fase 9 — Documentación OpenAPI/Swagger de la API pública (26/08/2026) — completa

Origen: único pendiente explícito de la Fase 2 ("API pública con API keys...
falta documentación OpenAPI/Swagger"), señalado también en §2.7 de la
comparativa.

✅ **`docs/api/openapi.yaml`** — spec OpenAPI **3.1.0** completo de los 8
endpoints de `/api/v1/public/*` (devices, devices/:id/readings, alerts,
reports/closures, reports/closures/:id, GET/PUT webhook): auth por
`X-Api-Key` (`securitySchemes`), rate-limit de 60/min documentado en la
descripción, límites de paginación reales por endpoint (`limit`/`offset`,
techos de 500/5000 según el caso — verificados contra
`pageParams()`/`getDeviceReadings` en `publicApiController.ts`, no
inventados), y todos los schemas de respuesta con los campos reales de cada
tabla (incluido `had_counter_reset` en las líneas de cierre). Se usó 3.1 en
vez de 3.0 específicamente para poder documentar los webhooks SALIENTES con
la sección nativa `webhooks:` (payload + envelope + firma HMAC de cada uno
de los 7 eventos) — 3.0 no tiene esa sección, hubiera quedado como texto
libre sin schema. Validado con `@redocly/cli lint`: 0 errores (JSON Schema
de 3.1 exige `type: [T, "null"]` en vez de `nullable: true` de 3.0 — todas
las 33 ocurrencias corregidas) y 0 warnings salvo `info-license` (deliberado:
API privada, no un producto con licencia pública).

**Bug real encontrado y corregido al documentar** (no buscado — apareció al
listar los 7 eventos de `PublicApiEvent` para la sección `webhooks:` y
notar que la validación de `PUT /webhook` sólo aceptaba 3): `VALID_EVENTS`
(`publicApiController.ts`) y su gemelo `PORTAL_WEBHOOK_EVENTS`
(`modules/clients/domain/services/client-rules.ts`) seguían con los 3
eventos originales de la Fase 2 (`reading.created`/`alert.created`/
`report.closed`) — nunca se actualizaron cuando `incidentWorker`/
`supplyRequestWorker` (Fases 3/4) empezaron a llamar
`sendPublicApiWebhook` con los 4 eventos nuevos
(`incident.created`/`.closed`, `supply_request.created`/`.completed`). Un
cliente no podía suscribirse a esos 4 eventos por NINGUNA de las dos vías
(portal o API pública) aunque el sistema ya los disparaba de verdad — el
cuerpo de la solicitud volvía siempre `400 events debe ser subconjunto de
reading.created, alert.created, report.closed`. **Segundo hallazgo, más
profundo**: el `400` real en ambos endpoints no lo tiraba esa validación de
dominio — lo tiraba ANTES el propio schema Ajv de Fastify
(`putWebhookSchema` en `publicApiRoutes.ts` **y** `client-routes.ts`, cada
uno con su copia de `maxItems: 3` hardcodeado) con
`FST_ERR_VALIDATION: body/events must NOT have more than 3 items` — un
tercer lugar con el mismo número mágico desactualizado, encontrado sólo al
verificar el fix en vivo contra el stack real (los tests existentes nunca
mandaban más de 2 eventos a la vez, así que nunca lo ejercitaban). Los 4
lugares (2 listas de validación de dominio + 2 `maxItems` de schema) quedan
en 7, con comentario cruzado a su gemelo para que la próxima vez que se
sume un evento no se actualice sólo uno de los cuatro.

Verificado de punta a punta contra el stack Docker real (rebuild de la
imagen `api`, no sólo `tsc`): `PUT /clients/:id/webhook` (portal) y
`PUT /api/v1/public/webhook` (API key) aceptando los 7 eventos completos,
`events` inválido sigue devolviendo 400 con el mensaje correcto. Suite
dirigida (130/130: `publicApi.test.ts`, `rbac.test.ts`,
`clientDirectory.test.ts`) verde sin regresiones — no se corrió la suite
completa de 34 archivos por alcance (cambio acotado a webhooks de API
pública, sin tocar ningún otro dominio); `tsc --noEmit` y `check:sizes`
limpios.

**Lo que NO se hizo de este ítem**: Swagger UI servido en vivo desde la API
(`@fastify/swagger`/`@fastify/swagger-ui`) — el spec queda como archivo
versionado en el repo, no una ruta `/docs` navegable; no hay dependencia
nueva que mantener ni superficie nueva sin auth que exponer. Colección
Postman/Insomnia generada a partir del spec (no pedida, generable después
con cualquier importador de OpenAPI si hace falta).

### Otros puntos de §3 (riesgos) que siguen abiertos y no forman parte de ningún ítem de arriba
- ✅ **R4 (parcial, 23/08/2026)**: el WS del portal ya NO acepta el JWT de
  sesión por query string. Investigado antes de tocarlo: no era vestigial —
  `Terminal.tsx` conecta directo a Render cuando el portal corre en Vercel
  (Vercel no proxea WS), y la cookie de sesión no cruza de `vercel.app` a
  `onrender.com` en ese handshake, así que sacarlo sin más habría roto la
  consola WS en producción. Se reemplazó por un **ticket de un solo uso, TTL
  60s** (`cloud/src/services/wsTicketService.ts`, `POST /portal/ws-ticket`,
  consumido atómicamente vía `GETDEL` en `ws/index.ts`) — el portal ya no
  cachea el JWT de sesión en `sessionStorage` (antes anulaba `httpOnly`
  exponiendo el mismo secreto a JS de la página). El agente DCA nunca usó
  esta vía (ya manda `Authorization: Bearer` como header nativo). El
  registro de sockets en memoria (multi-réplica) sigue en Fase 2; el
  cross-origin Vercel/Render de raíz sigue sin resolverse (fuera de alcance,
  ver plan de esta pasada).
- ✅ **R5 (23/08/2026)**: cerrado. Se corrió `installer/gen-keys.js` — clave
  real generada, `updateKey.ts` ya no tiene el placeholder. La privada
  (`installer/signing.key`) queda fuera del repo, no recuperable si se pierde
  — resguardarla es responsabilidad operativa, no de código. De acá en más
  `build-installer.bat` firma cada release (bundle.js + stc-update.zip) con
  `sign-bundle.js` antes de publicarlo; sin ese paso los agentes rechazan la
  actualización. También cerrado esta pasada: rollback a la versión anterior
  si la actualización falla, verificado contra Windows real — ver "Estado de
  implementación", ítem "Mejoras de agente".
- ✅ **R6 (23/08/2026)**: cerrado. `build-installer.bat` tenía ya un mecanismo
  de sync de versión, pero apuntaba a `agent/src/core/main.ts` buscando un
  literal que se había movido a `version.ts` en Fase 0 — el `-replace` de
  PowerShell no falla si no encuentra el patrón, así que `version.ts` quedaba
  desincronizado **en silencio** en cada build desde entonces (hallazgo, no
  sólo fix). Corregido el target y sumado el `.csproj` del Monitor UI
  (`<Version>`/`<FileVersion>`), que nunca había estado cubierto. De paso se
  corrigió un bug de encoding que este cambio hizo evidente (`Get-Content`
  sin `-Encoding UTF8` corrompía acentos). Validado corriendo el bloque real
  contra `powershell.exe` real vía interop WSL2, con copias descartables —
  no se tocó ningún archivo de producción durante la verificación.
- **R9**: paginación (arriba, Fase 1 RBAC — no hecho); `Terminal.tsx` sigue con
  `wss://stc-cloud.onrender.com` hardcodeado; 401 sigue haciendo
  `location.replace` sin preservar la ruta.

---

## 0. Resumen ejecutivo

1. **El motor de captura ya está al nivel de SDS en *qué* lee** (identidad, contadores, insumos con part number/serial/páginas restantes, alertas, bandejas, firmware, MAC, hostname, ubicación). Eso es el 80 % de lo que vende SDS. Donde quedamos cortos es en **cómo se opera la plataforma**: loop de alertas, notificaciones, ciclo de vida de alertas, reportes/cierre de facturación, RBAC por cliente, SNMPv3, identidad de dispositivo a nivel cliente, retención/índices de base de datos, despliegue multi‑réplica.
2. **La comparativa v1.0 (mayo 2026) está desactualizada en 5 puntos** (§1). Hay que reescribirla antes de volver a mostrarla.
3. **Hay 4 defectos que pierden o corrompen datos de facturación hoy** (§3, R1): la cola local purga lecturas *no sincronizadas* de más de 7 días **antes** de intentar subirlas; meter/supplies no respetan backpressure; el sync no es idempotente (reintento = duplicados; `readings` no tiene PK); y el volumen mensual se calcula `MAX−MIN` sin detectar resets de contador.
4. **El esquema de producción no es reproducible desde las migraciones** (hypertable, compresión y `readings.supplies_details` existen sólo en prod). Un deploy limpio rompe `/devices/sync`.
5. **No hay política de retención ni índice por `device_id` en `readings`**: con ~1.000 equipos a 20 min/lectura son ~26 M filas/año y cada consulta por equipo escanea toda la hypertable.
6. **Seguridad:** faltan CSRF, scoping por cliente (IDOR de portal), hay login de respaldo por variable de entorno en texto plano, token WS por query string, y el repo tiene commiteados `.env`, `config.enc`, un dump de prod y un `.exe` de 68 MB.
7. **Release/versionado frágil:** `VERSION` hardcodeada en 5 archivos (y ya divergen: `1.0.0` vs `1.2.0`), tres pipelines de build incompatibles (pkg/node18, esbuild/node24, copia de `process.execPath`), el instalador embebe `http://localhost:3000` y hay tres hostnames distintos del backend.

**Ventajas reales de STC sobre SDS que hay que preservar:** multimarca, un solo puerto 443, sincronización cada 5 min (SDS sube contadores 1×/día), detalle de insumos más rico que el de SDS, consola remota, sin dependencia de HP Cloud.

---

## 1. Qué dice la comparativa v1.0 que ya no es cierto

| Afirmación en `STC_Comparativa_HP_SDS_vs_STC_Cloud_v1.0.html` | Realidad en código (ago‑2026) |
|---|---|
| "SNMP sólo para identificación; EWS primario para contadores" | Hoy SNMP es **fuente autoritativa** de contadores en HP FutureSmart (`agent/src/capture/families/hp-futuresmart.ts`) y `generic.printer-mib` completa todo campo a campo. Es *mejor* que lo documentado, pero los docs de cliente siguen diciendo lo contrario. |
| "Gap residual: sin firmware" / "sin tracking de MAC" | Firmware, MAC, hostname, ubicación y SKU se capturan (`generic-printer-mib.ts:147-183`), viajan en `DeviceReading` (`capture/reading.ts:46-49`) y se persisten en `devices` (migraciones `20260806…`, `20260821…`). **Gap restante:** la MAC no se usa como clave de identidad (ver §2.4). |
| "Alertas operativas y bandejas fuera de scope" | `alerts` y `trays` son scopes implementados y se recogen en discovery y en el loop de supplies (`ScanService.ts:14-16`). Lo que falta es el **loop dedicado** de 3/15 min y el ciclo de vida de alertas (§2.2). |
| "PJL: verificar que no se use" (P1) | Se usa: último recurso para total (`capture/index.ts:213-218`), identidad (`:120-124`) y en `hp.jetdirect-legacy` (`:38-46`). No hay detección de "PJL deshabilitado" (FS 4.5+). Impacto bajo (es último recurso) pero el P1 de la comparativa sigue abierto. |
| "Múltiples agentes por site: no soportado" | El modelo `clients → agents` es 1:N; sí se pueden crear varios. El gap real es otro: la unicidad de dispositivo es `(agent_id, serial)` → la misma impresora vista por dos agentes son dos dispositivos (§2.4). |
| "Planificador custom (scan_schedule) implementado" (Master Prompt + HTML "Funcionamiento Interno") | La columna `agents.scan_schedule` existe (migración `20260524020000`), el tipo `ScanSchedule` existe en `shared/types.ts:13-18`, pero **ni el agente lo lee ni el portal lo envía** (`useMonitorDetail.ts:92-98`, `HeartbeatService.ts:119-143`). Documentado, no implementado. |

Otras inconsistencias doc↔código a corregir: README "26 tests" (son 56; CI corre 11), Node 20 (pkg node18 / esbuild node24), PBKDF2 "100k" en varios HTML (el código usa 210 000: `security.ts:3-7`), `data_collection_inventory.md` dice que sólo se recolecta por SNMP y no menciona hostname/ubicación/sysContact/alertas/bandejas (hoy sí se recolectan; `sysLocation`/`sysContact` pueden contener PII → impacta el argumento GDPR), `EWS_SCANNER_AUDIT.md` describe la cascada vieja, `CODE_MAP.md` menciona `bridge/` inexistente y `ws/server.ts` (es `ws/index.ts`).

---

## 2. Gaps frente a HP SDS (por área)

Leyenda de prioridad: **P0** bloquea facturación/seguridad · **P1** paridad operativa con SDS · **P2** diferenciación · **—** fuera de scope consciente.

### 2.1 Loops de monitoreo
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Loops | 5 independientes: Alert 3/15, Identity 10/60, Meter 20/240, Consumables 60/240, Tray 480 | 3: Discovery 10/60, Meter 20/240, Supplies(+alerts+trays) 60/240 (`TaskScheduler.ts:53-79`) | Falta **Alert loop 3/15** (hoy alertas cada 60 min en horario y 240 fuera) y Tray separado | P1 |
| Horario laboral | 08‑18 L‑V configurable | Hardcodeado 08‑18 L‑V **America/Argentina/Buenos_Aires** (`BusinessHours.ts:14,26-28`) | Configurable por agente + TZ del cliente | P1 |
| Auto‑optimización | "Si un loop tarda más que su intervalo, el siguiente arranca de inmediato"; se autoajusta por carga | Tick cada 5 s, una tarea por tick (`if/else if`), sin medir duración ni adaptar | Métrica de duración por loop + adaptación | P2 |
| Envío de contadores | Lee cada 20 min, sube 1×/día + botón "Get Latest Counts" | Sube todo cada 5 min | **Ventaja STC** en frescura, pero genera ~72 filas/día/equipo sin dedupe (§3 R3) | — |
| Scheduler custom (días/horas) | n/a (SDS usa horario laboral) | Sólo tipo + columna, sin uso | Implementar o quitar de docs | P1 |

### 2.2 Alertas y notificaciones
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Tipos | Estado de dispositivo (papel, atasco, puerta, error), consumibles, offline | `toner_*_low/critical`, `device_error` si `offline`, y strings libres desde EWS (`alertWorker.ts:45-113`, `agentService.ts:693-717`) | Sin `agent_offline` (enum existe, nunca se escribe), sin `device_offline`, sin *counter reset*, sin normalización de `prtAlertTable` (viajan como texto) | P0/P1 |
| Ciclo de vida | Activa → reconocida → resuelta | Auto‑resolve por umbral; **sin acknowledge**, sin cierre manual, sin filtro en UI | Ack/resolve + historial + SLA | P1 |
| Notificaciones | Email/push vía plataforma MPS | **Ninguna**; formulario SMTP del portal está `disabled` (`Settings.tsx:281-303`); `SMTP_*` en `.env.example` no se leen | Email + webhook + digest diario | P0 |
| Umbrales | Por dispositivo/grupo | Por agente (`agents.toner_*_threshold`); el `TONER_WARN_PCT` de env es código muerto; el "offline threshold" de Settings vive en `localStorage` | Un solo modelo de umbrales: cliente → agente → dispositivo | P1 |

### 2.3 SNMP y descubrimiento
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Versiones | v1/v2c/v3 (MD5/SHA‑2, DES/AES), **lista de credenciales** probadas en orden (`add cred`, IMIL) | v2c hardcodeado (`transport/snmp.ts:44`); `snmpVersion` en config es campo muerto; una sola community | SNMPv3 + lista de credenciales por agente/rango | P1 |
| Rangos | Zonas con nombre, point lookups por hostname/IP, `r=F` fast, nivel SNMP por rango, enable/disable por rango | Array `ip_ranges` start‑end; sin CIDR, **sin tope de tamaño** (`ScanService.ts:57` materializa todo), sin exclusiones, sin lookups por hostname | CIDR, cap (p. ej. ≤ 4 096 IPs/rango), exclusiones, hostname | P1 |
| Métodos | ICMP+SNMP+SLP+WS‑Discovery | TCP 9100/631/80/443 + SNMP‑first | Decisión intencional válida; mDNS/WS‑Discovery como complemento opcional | P2 |
| Per‑device ops (IMIL) | `set mon to X for N`, `reset device N counts`, `update device N set serial/ip`, `get mib using N`, `resend device N counts`, `test snmp` | Consola: `status`, `ping`, `snmp-check` (`ConsoleEngine.ts:29-113`); comandos remotos: RESCAN/RESTART/STC_CONSOLE/FORCE_UPDATE | Falta: deshabilitar monitoreo por equipo, reenviar lecturas, MIB walk remoto, corregir identidad, descubrir una IP puntual | P1/P2 |

### 2.4 Identidad del dispositivo
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Clave | MAC + serial; sobrevive cambio de IP y reinstalación del DCA | `device_id = serial ?? ip` en el agente (`sync/database.ts:136`); servidor único parcial `(agent_id, serial)`; `mac` se guarda pero la unicidad por MAC se **eliminó** (`20260512142601`) | Clave compuesta `(client_id, serial)` con MAC como secundaria; equipos sin serial → MAC; merge de duplicados | P0 |
| Ámbito | Por cliente (service‑provider partitioning) | Por agente → 2 agentes en la misma VLAN = 2 dispositivos con histórico partido | Mover la identidad al cliente | P0 |
| Ciclo de vida | Deshabilitar, reubicar, reidentificar | Sólo **borrado duro** (y `DELETE /devices/offline` borra equipos no vistos en 30 min de **todos los clientes** si no se pasa `agent_id`, sin audit log: `deviceController.ts:111-141`) | Decommission (soft), mover entre agentes/clientes, merge, editar nombre/ubicación | P1 |

### 2.5 Reportes y facturación
| | HP SDS Manager | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Vista de contadores | Pestaña Counts por equipo, "Get Latest Counts", histórico | `DeviceDetail` con 48 puntos; no hay página de reportes; `/reports` del dashboard es link muerto | Página de reportes por cliente/período | P0 |
| Cierre de período | Sí (en la plataforma MPS) | `MAX−MIN` del mes en curso (`dashboardController.ts:38`, `portalAgentController.ts:115-117`), sin selector de período, sin snapshot de cierre | "Cierre mensual" inmutable por equipo con lectura inicial/final, delta, método, fuente; reabrir/ajustar con auditoría | P0 |
| Exportación | CSV/API | CSV por monitor (`ReportsTabPanel.tsx:17-51`) y CSV "TIPO/CLASE" estilo legado (`DeviceInventoryTable.tsx:16-45`) | XLSX/PDF, export por cliente, **entrega automática** (el STC legado ya enviaba por FTP/mail a AWS y un batch importaba al ERP; hoy eso se perdió) | P1 |
| Detección de anomalías | — | — | Reset/decremento de contador, salto irreal, tóner que cae sin páginas (prometido en el Dossier de Operaciones §4 pero no implementado) | P1 |

### 2.6 Portal, RBAC y multi‑tenant
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Jerarquía | Service Provider → sub‑SP → Customer; GUID en vez de nombre | `users` admin/operator; **ningún endpoint filtra por `client_id`**; no existe rol "cliente" | Rol client‑viewer con scoping en todos los controladores | P0 |
| Auth | HP ID | Cookie httpOnly + token también en body/`/me` + `sessionStorage` para WS; login de respaldo `PORTAL_ADMIN_PASSWORD` en texto plano (`authController.ts:52-68`); sin MFA/lockout | Quitar backdoor, CSRF, lockout, MFA opcional | P0 |
| Tablas | Paginadas | Sin paginación ni orden en ninguna tabla; `readings?limit=400` | Paginación server‑side | P1 |
| Dead code | — | `pages/Devices.tsx`, `pages/Monitors.tsx`, `EditMonitorModal.tsx`, rutas `/reports` y `/monitoring` | Limpiar | P2 |

### 2.7 Plataforma, datos y cumplimiento
| | HP SDS | STC hoy | Gap | Prio |
|---|---|---|---|---|
| Retención | 10 años, política publicada | **readings**: 24 meses (`add_retention_policy` nativo); **agent_logs**: 90 días; **alerts resueltas**: 12 meses (job app-level); **audit_logs**: sin purga (write-only, decisión de negocio); compresión 7 d en readings | Política formal publicada + agregados continuos | P2 |
| Esquema | — | Migraciones ≠ prod (hypertable comentada en `20260506000000:55-58`; `readings.supplies_details` y drop de `readings.id` sólo en prod) | Migración de reconciliación | P0 |
| Índices | — | Sólo `readings(time)`; falta `(device_id,time)`, `alerts(device_id,resolved)`, `audit_logs`, `agents(client_id)` | Índices | P0 |
| Certificaciones | ISO 27001/27017, SOC 2, NIST CSF | Ninguna (decisión consciente) | Al menos: política de retención, DPA, inventario de datos actualizado | P2 |
| API pública / ISV | SDS API para MPS | ✅ (23/08/2026) API keys por cliente (`api_keys`, hash SHA-256) + webhooks de integración ERP (`api_webhooks`, firma HMAC) para lecturas/alertas/cierres, endpoints `/api/v1/public/*`; ✅ (26/08/2026) spec OpenAPI 3.1 completo, `docs/api/openapi.yaml` | UI de portal para keys/webhooks ya hecha (23/08/2026) | — |
| Remote EWS | Sí (túnel, whitelist, expira) | No | Túnel HTTP sobre el WSS existente, con allowlist y TTL | P2 |
| Firmware push / reboot remoto | Sí | No | — (fuera de scope declarado) | — |
| Equipos USB | SDA (agente en PC) | No; el STC legado usaba HP FleetAdminPro SnmpAgent | Documentar el camino (mismo truco: SNMP agent local) | P2 |
| Licencia/activación | Key 12 dígitos + código de proveedor + **archivo de licencia offline**; reinstalar reutiliza la DB | Key 64 hex online; **el desinstalador borra `C:\ProgramData\STCCloudMonitor`** (`STC-Monitor.iss:77-81`) → se pierde la cola | Activación offline; "mantener datos" al desinstalar; reinstalar sin nueva key | P1 |
| Proxy | Básico (sin NTLM) | Básico (sin NTLM) | Igual | — |
| HA del DCA | Varios JAMC por site | Varios agentes por cliente, pero identidad por agente (§2.4) | Dedupe cross‑agente | P0 |

---

## 3. Fallas a futuro (riesgos técnicos) — ordenadas por severidad

### R1 · Pérdida / duplicación de lecturas (facturación) — **P0**
- `purgeOld()` borra `synced = 1 OR created_at < now‑7d` (`agent/src/sync/database.ts:211-216`) y se ejecuta **antes** de `uploadPending` en cada ciclo (`SyncService.ts:40-42`). Un agente sin WAN > 7 días pierde lecturas silenciosamente. Contradice `AUDIT_DOSSIER.md §2.D` y el Manual de Usuario.
- Backpressure (10 000) sólo se evalúa en `scan()` (`ScanService.ts:48`); meter y supplies siguen encolando (`isBackpressureActive()` no se usa).
- Sync sin idempotencia: `POST /devices/sync` no lleva id de lote ni de lectura; servidor hace `insert(validReadings)` sin unique `(device_id,time)` y `readings` en prod **no tiene PK** → un 200 perdido = lecturas duplicadas.
- Respuesta `{status:"success"}` aunque fallen inserts por dispositivo (`agentController.ts:82`, `agentService.ts:763-774`).
- `cartridge_estimated_yellow` no está en el schema de la ruta → se descarta en silencio (`agentRoutes.ts:47-49`).
- Fechas `DD/MM/YYYY` parseadas con `-03:00` fijo (`agentService.ts:470,741`); fechas inválidas → `new Date()` (rompe replays offline).
- Volumen mensual `MAX−MIN`: un reset de contador o reemplazo de equipo **infla** la factura; no hay detección en agente ni servidor.

### R2 · Esquema no reproducible — **P0**
Deploy limpio con `migrate:latest` crea `readings` con `id uuid PK`, sin hypertable, sin `supplies_details` → el primer sync falla (`agentService.ts:760`). Además `server.ts:61-79` reescribe `knex_migrations.name` `.ts↔.js` en cada boot, `render.yaml` migra en build y en runtime, y `deploy.sh:126-127` ignora fallos de migración.

### R3 · Escalabilidad de datos — **P0/P1**
- Sin índice `(device_id, time)` → toda consulta por equipo/mes escanea la hypertable; `alerts`/`audit_logs` sin índices.
- N+1 en ingestión: ≥ 3 queries por lectura + 1 SELECT por alerta (`agentService.ts:541-717`) → un lote de 500 son ~1 500 round‑trips; `new Queue()` de BullMQ por request (`:806`).
- Sin dedupe de lecturas idénticas: equipo ocioso genera 72 filas/día. 1 000 equipos ≈ 26 M filas/año sin retención.
- Sin agregados continuos; dashboard y reportes calculan sobre crudo.

### R4 · Diseño mono‑instancia y operación — **P0**
- Registro de sockets WS en memoria (`ws/index.ts:24-25`), `heartbeatMonitor`/`alertWorker` como `setInterval` en el mismo proceso → no se puede escalar a 2 réplicas; en Render free el spin‑down mata los timers.
- `restart: "no"` en **todos** los servicios de `docker-compose.yml` y `docker-compose.prod.yml`; sin límites de recursos; contenedor corre como root; `npm install` sin lockfile.
- `/health` devuelve un string fijo (no prueba DB/Redis) y es lo que usa el HEALTHCHECK.
- Backups: sólo en compose (y con `restart: "no"`); el prod real (Render/Neon) no tiene backup; `restore_volume.sh` es destructivo sin confirmación.
- `deploy.sh:56-59` tiene la precedencia `|| … &&` invertida: rechaza un `.env.production` válido.

### R5 · Seguridad — **P0**
- Sin CSRF con cookie `sameSite:"none"` en prod; token también devuelto en body y `/portal/me`; WS acepta `?token=` (queda en logs de nginx); WS no verifica revocación/blacklist.
- IDOR de portal: ningún `:id` se valida contra el cliente del usuario; `createClient` inserta `request.body` entero (mass assignment); `PUT /agents/:id/config` sin schema.
- Login de respaldo por env en texto plano (`authController.ts:52-68`) que además deja `user_id = null` en audit_logs; bootstrap con `stc123456`.
- `x-forwarded-for` confiado sin `trustProxy` → rate‑limit spoofable.
- Updater: si `UPDATE_PUBLIC_KEY_HEX` es el placeholder **omite la firma** (`UpdateService.ts:111-112`); si el servidor no manda hash, instala igual (`:99-109`); sin rollback.
- `STC_CONSOLE` es un canal remoto hacia un ejecutor local (validado por regex, pero es superficie).
- Repo: `.env`, `config.enc`, `local_db.json`, `fresh_dump_20260819.sql`, `pgdata_backup.tar.gz`, `Instalador-STC-Monitor.exe` (68 MB) commiteados.
- Audit logs ausentes para: borrar dispositivo/bulk, comandos remotos (RESTART/FORCE_UPDATE/STC_CONSOLE), cambio de versión de agente, logins.

### R6 · Release, versionado y build — **P1** — cerrado (24/08/2026)
- ✅ `VERSION` ya no está hardcodeada en ningún lado: `HeartbeatService.ts`,
  `UpdateService.ts`, `CliCommands.ts` y `ConsoleEngine.ts` importan todos
  de `core/version.ts` (verificado grepeando los 4 archivos — cero
  literales `1.0.0`/`1.2.0` sueltos).
  ✅ **Corrección (25/08/2026) a esta misma nota**: sí existe un script de
  sincronización automática — `installer/build-installer.bat` ya traía un
  mecanismo (PS1 temporal con `-replace`) que actualiza `.iss`,
  `version.ts` y `.csproj` al pedir una versión nueva al build del release
  (con un bugfix propio del 23/08/2026 documentado inline sobre
  exactamente este tipo de desincronización silenciosa). Lo que faltaba de
  verdad era sólo `agent/package.json` — no lo lee ningún código en
  runtime, pero seguía divergiendo en la metadata que ve cualquiera que
  corra `npm ls`/`npm view` sobre el agente. Se agregó al mismo mecanismo.
  Sin verificar en Windows real (no hay PowerShell en este entorno Linux)
  — verificada sólo la lógica del patrón de reemplazo contra el contenido
  real de `package.json` en Node.
- ✅ **CI ya no construye algo distinto de lo que se instala** (24/08/2026).
  Confirmado el bug real: el job `agent` de `.github/workflows/ci.yml`
  corría `npm run build:agent` → `npx pkg agent/dist/core/main.js --target
  node18-win-x64 --output dist/STCCloudMonitor.exe` y subía ese `.exe` como
  artifact — pero **ningún instalador real usa ese pipeline**:
  `installer/build-installer.bat` arma el release real con
  `agent/build-sea.js` (bundle esbuild + copia del runtime de Node) +
  firma + Inno Setup. El `.exe` de `pkg` era: (a) huérfano — `pkg`/
  `postject` no se usaban en ningún script real, sólo devDependencies
  vestigiales de un diseño de SEA descartado —, y (b) potencialmente
  engañoso — alguien podía asumir que ese CI verde certificaba el
  instalador real, cuando no probaba ni el bundling de esbuild ni nada
  del pipeline que se firma y distribuye. Se reemplazó el paso de CI por
  `node build-sea.js` (el bundling REAL, JS puro — se valida igual en
  `ubuntu-latest` aunque el `stc-node.exe` resultante ahí no sea un binario
  Windows válido, eso no es lo que importa validar) y se sube
  `agent/dist/bundle.js` como artifact en vez del `.exe` huérfano. Se
  eliminaron `pkg`/`postject` de `agent/package.json` (devDependencies +
  bloque de config `"pkg"`) y el `build:agent` de la raíz ahora apunta al
  pipeline real (`build -w agent && node agent/build-sea.js`).
  `capture.test.ts`/e2e del backend en CI: ya estaban corriendo (ver Fase 0
  ítem 7 arriba) — esa parte del hallazgo original ya no aplica, sólo
  quedaba desactualizada en el doc.
  Verificado: `npm test -w agent` 200/200 tras el cambio de
  devDependencies; `node build-sea.js` corrido localmente produce
  `bundle.js` (737.7kb) igual que antes; YAML del workflow validado.
- ✅ Hostnames: no queda ningún `onrender.com` hardcodeado —
  `Terminal.tsx` ya deriva `wss://`/`ws://` de `window.location.host` (fix
  previo del ticket de WS de un solo uso) y `vercel.json` **ya no existe**
  en el repo (el proyecto es self-hosted vía `docker-compose`, no
  Vercel/Render). Ambos puntos del hallazgo original quedaron obsoletos
  por decisiones de infraestructura tomadas en pasadas previas, no por un
  fix de esta pasada.
- ✅ Desinstalar con opción de conservar datos: ya implementado
  (`installer/STC-Monitor.iss` pregunta explícitamente si mantener
  activación/historial al reinstalar/desinstalar) — cerrado en la Fase 2
  ("mantener datos al desinstalar").

### R7 · Zona horaria y multi‑país — **P1** — cerrado (funcional; queda cosmético)
✅ Ya no hay TZ fija en ninguno de los 3 puntos citados por el hallazgo
original — verificado contra el código, no sólo el doc (desactualizado
acá también): `BusinessHours.ts` toma un `timezone` IANA por config (con
`DEFAULT_BUSINESS_HOURS.timezone = 'America/Argentina/Buenos_Aires'` sólo
como fallback sin romper agentes sin configurar), `Logger.ts` usa
`TimeZoneUtils.getConfiguredTimezone()` (seteado al boot y actualizado en
cada heartbeat que trae una TZ nueva — `HeartbeatService.handleRemoteConfig`),
y `portalAgentController.ts` ya no existe como archivo único con un
`-03:00` hardcodeado (se dividió en `portalAgentController/` como parte de
una modularización previa; no hay ningún `-03:00` literal en ese
directorio). Esto ya se había cerrado en la Fase 1 ("Horario laboral y TZ
configurables por agente") — el hallazgo de R7 en esta sección nunca se
había marcado como resuelto ahí, quedó como el único punto realmente
pendiente: **cosmética de locale** (`es-AR` fijo en `Logger.ts` — formato
de fecha, no la TZ real — y en el portal), que ya estaba explícitamente
diferida en esa misma Fase 1 para una pasada de polish aparte (no es un
bug funcional: un cliente en Chile/México ya tiene horario laboral y
cierres mensuales correctos con su propia TZ, sólo ve fechas con formato
argentino en vez del local).

### R8 · Cobertura de marcas — **P1**
Familias reales sólo HP/Samsung/Lexmark (18 perfiles). Ricoh/Brother/Xerox → `generic.ews` + OIDs parciales (`BROTHER_OIDS.totalPages` vacío; Xerox mono=color). Canon, Kyocera, Konica Minolta, Epson, Sharp, Toshiba, OKI, Pantum ni siquiera son `Brand` → caen a `generic` (Printer‑MIB sirve para total/insumos, pero sin desglose color ni alertas ricas). En un MPS multimarca esto limita la promesa comercial.

### R9 · Portal — **P1** — cerrado
✅ **Paginación server-side real, primer listado** (25/08/2026, ver abajo).
Todo lo demás: ~~3 tipos
`Alert` distintos~~ (✅ ya consolidados en `types/alerts.ts` por una pasada
previa de alertas — ver docblock ahí), ~~tipo `MonitorData.config` miente
(se parsea como string)~~ (✅ 24/08/2026 — resultó ser código muerto en el
portal, no un problema del backend), ~~`Terminal.tsx` hardcodea
`wss://stc-cloud.onrender.com`~~ (✅ ya resuelto — deriva de
`window.location.host`, quedó así desde el fix del ticket de WS de un solo
uso, R4 más abajo), ✅ **401 hace `location.replace` y pierde la ruta**
(24/08/2026), ✅ **Settings guarda un umbral offline en `localStorage` que
en realidad no lo lee nadie** (24/08/2026, ver abajo).

✅ **El umbral de inactividad de Settings ahora controla de verdad
`jobs/heartbeatMonitor.ts`** (24/08/2026). Migración
`20260824210000_system_settings_offline_threshold.ts`: tabla singleton
`system_settings` (PK booleana + `CHECK (id)`, una sola fila posible a
nivel de esquema — no de disciplina de aplicación) con
`agent_offline_threshold_minutes` (rango 1-1440 vía CHECK). Nuevo módulo
`modules/system-settings/` (domain/infrastructure/presentation, mismo
patrón que `two-factor`): `GET/PUT /api/v1/settings/system`, `PUT`
admin-only (mismo criterio que `updateAgentVersion` en
`authController/agent-version.ts`), auditado
(`SYSTEM_SETTINGS_UPDATED`). `heartbeatMonitor.ts` deja de tener
`OFFLINE_THRESHOLD_MINUTES` como constante de módulo — ahora se lee de la
tabla en CADA tick (cada 2 min), con **fail-open** al default (5 min) si
la lectura falla, para que un problema puntual de esa fila nunca tumbe el
monitor completo (confirmado en vivo: el primer tick corrió ANTES de que
la migración terminara de aplicarse, cayó al fail-open, logueó el error, y
seguí funcionando con normalidad). `Settings.tsx`/`MonitorThresholdCard.tsx`
pasan de `localStorage` a `GET/PUT /settings/system`, con el input
deshabilitado para roles no-admin (que igual pueden VER el valor vigente).

Deliberadamente NO se tocó en esta pasada: `DEVICE_OFFLINE_THRESHOLD_MINUTES`
(el umbral del EQUIPO, mismo archivo) ni las copias del portal
(`lib/constants.ts`, usadas en 9 archivos para badges "sin contacto" del
lado cliente) — unificar TODAS las copias del mismo concepto es el
"modelo unificado de umbrales" que este documento ya marcaba como una
pasada aparte; éste era el único umbral que ya tenía un control de UI
prometiendo hacer algo que no hacía, así que fue el único que se conectó.

Verificado de punta a punta contra el stack Docker real (no sólo tests):
`GET`/`PUT` por curl (valor por defecto, actualización, rango inválido →
400, operator → 200 en GET/403 en PUT, client_viewer → 403 deny-by-default,
fila de audit con el valor nuevo en metadata); Playwright real —
`Settings.tsx` carga el valor del servidor, lo guarda, sobrevive un
reload; CI completo (29 archivos, 0 fallos) tras el cambio a
`heartbeatMonitor.ts` y `server.ts` (archivo compartido con la migración
de arquitectura de `agents`, coordinado con la otra sesión para no pisar
su commit — sus 54 archivos de `modules/agents` y mis 2 líneas de
`server.ts` quedaron en el mismo commit de esa sesión, ver git log).

✅ **`MonitorData.config.ip_ranges` NO era un bug del backend — investigado
a fondo antes de tocar nada** (24/08/2026). Las 3 columnas en cuestión
(`agents.ip_ranges`, `snmp_credentials`, `business_hours`) son `jsonb` en
Postgres — `node-pg` las devuelve SIEMPRE ya parseadas, nunca como string;
confirmado con `\d agents` contra la base real. Los `typeof === 'string'
? JSON.parse(...) : ...` repetidos por todo `agentService/config.ts` y
`portalAgentController/reads.ts` (backend) nunca disparan esa rama en
producción — son defensivos-pero-muertos, no la causa del problema. Esto
significa que el fix real es **puramente de portal**, sin tocar
`agentService/config.ts` para nada (así que no hacía falta esperar a la
migración de `agents` para este ítem en particular). Se limpiaron los 2
lugares del portal con el mismo workaround muerto:
`components/monitors/ConfigTabPanel.tsx` (el editor real, usado desde
`MonitorDetail.tsx`) y `components/monitors/EditMonitorModal.tsx` — este
último resultó ser **código huérfano sin un solo importer**, y además
tenía errores de tipo reales contra el `EditFormData` actual (`ipStart`/
`ipEnd` ya no existen en ese tipo — se armó para una versión vieja del
formulario de un solo rango, antes del editor multi-rango actual). Se
borró en vez de arreglarlo.

**Hallazgo más grande en el camino, no buscado**: al intentar verificar el
fix con `tsc --noEmit` desde `cloud/portal/`, salió limpio — pero
resultó ser un **falso positivo**. `cloud/portal/tsconfig.json` es
"solution-style" (`{"files": [], "references": [...]}"`), y un `tsc
--noEmit` plano (sin `-p` ni `--build`) contra ESE archivo no seguía las
referencias — tipeaba CERO archivos, silenciosamente, exit 0. Esto es
exactamente lo mismo que corre `npm run check` (usado por CI, job
`portal`) y lo mismo que corrí yo mismo más temprano en esta sesión para
"verificar" los cambios de `postLoginRedirect.ts`/`App.tsx`/`Login.tsx` —
ninguna de esas verificaciones había tipeado nada en realidad. Re-corrido
contra `-p tsconfig.app.json` (el project real): confirmó que esos 4
archivos SÍ están limpios (nada que corregir ahí), pero además reveló los
errores reales de `EditMonitorModal.tsx` de arriba y 3 más en
`ErrorBoundary.tsx` (import default de `React` sin uso — quedó del JSX
transform viejo — y `ErrorInfo`/`ReactNode` necesitando `import type` bajo
`verbatimModuleSyntax`). Se corrigieron los 3. Se arregló la causa raíz:
`package.json` → `"check": "... tsc --noEmit -p tsconfig.app.json ..."`
(antes sin `-p`, CI incluido). De paso, `tsconfig.node.json` apuntaba a un
`vite.config.ts` que ya no existe (el repo usa `vite.config.mjs`) — se
borró junto con su referencia en el `tsconfig.json` raíz, no cumplía
ninguna función.

**Importante para el resto del backlog**: cualquier verificación de `tsc`
en `cloud/portal/` hecha en pasadas anteriores de este mismo documento
(antes del 24/08/2026) que haya corrido `tsc --noEmit` sin `-p
tsconfig.app.json` debe tratarse como no verificada — no como "confirmada
limpia". No se re-auditó retroactivamente todo el historial por alcance,
pero el mecanismo del falso positivo queda documentado acá para quien
retome R9/R10.

Verificado: `npm run check` (icon-check + tsc real + eslint) limpio;
`npm run build` limpio; Playwright real contra el stack Docker — pestaña
Configuración de un monitor real renderiza sin errores de consola, con y
sin `ip_ranges` configurados.

✅ **401/deep-link sin sesión ya no pierde la ruta** (24/08/2026). Dos
puntos de entrada perdían a dónde iba el usuario: el interceptor 401 de
`lib/api.ts` (sesión expirada a mitad de uso) y el guard `RequireAuth` de
`App.tsx` (deep-link directo sin sesión) mandaban siempre a `/login` y,
tras el login, `Login.tsx` navegaba siempre a `/`. Se agregó
`lib/postLoginRedirect.ts` (`stashCurrentPath`/`consumePostLoginRedirect`,
sobre `sessionStorage`) y se conectó en los 3 puntos. Bug real encontrado
en el camino: el primer intento en `RequireAuth` leía `window.location`
DENTRO de un `useEffect`, pero el `<Navigate>` hermano (hijo en el árbol)
corre su propio efecto ANTES que el del padre — para cuando el efecto de
`RequireAuth` se ejecutaba, `window.location` ya apuntaba a `/login`, y el
guard de "nunca guardar /login" descartaba todo. Se arregló capturando la
ruta con `useLocation()` en el render (no releída después). Verificado con
Playwright real contra el stack Docker: deep-link sin sesión → login →
vuelve al deep-link (no a `/`); cookie de sesión corrompida a mitad de uso
→ 401 → login → vuelve a la página en la que estaba.

✅ **Paginación server-side real: `GET /devices` + `Devices.tsx`**
(25/08/2026). Alcance decidido sin pedir confirmación (mandato explícito
de Ivan: elegir el diseño más óptimo/mantenible y ejecutar) — de las 3
superficies de listado de equipos (`GET /devices` global,
`GET /clients/:id/devices` por cliente, `GET /agents/:id/devices` por
monitor), se priorizó la primera: es la que el hallazgo original nombraba
explícitamente, y ya tenía un techo de seguridad `.limit(5000)` fácil de
convertir en paginación real.

✅ **Techo de seguridad en las otras 2 superficies** (25/08/2026). No
justificaban paginación real todavía (`/clients/:id/devices` sólo
alimenta 2 `<select>` chicos — `CreateIncidentModal`, `RemoteActions` —,
no una tabla; construir un combobox de búsqueda ahí sería sobre-ingeniería
dado el tamaño real de la flota, ~1,7 equipos por cliente en promedio),
pero **`/clients/:id/devices` no tenía NINGÚN límite** (peor que el
`.limit(5000)` que sí tenía `/devices` antes de esta pasada) — un cliente
atípico con cientos de equipos podía tumbar ese selector. Se agregó
`.limit(500)` ahí y `.limit(1000)` a `/agents/:id/devices` (alimenta
`DeviceInventoryTable.tsx`, una tabla real con selección/exportación — más
candidata a paginación real en el futuro si algún sitio la satura, pero
eso es un rediseño de UI aparte, no un fix de una línea). CI completo
32/32 en 0 tras el cambio.

Implementación: `KnexDeviceRepository.list()` pasa de `Promise<DeviceRow[]>`
a `Promise<{items, total}>`, mismo criterio ya establecido en el propio
módulo (`ListPendingDevicesUseCase`/`listPending` — límite 50, techo 200,
`Promise.all([itemsQuery, countQuery])`) — no el de `/audit-logs`, que
además devuelve `limit`/`offset` en la respuesta; acá no hace falta, el
caller ya sabe qué pidió. Búsqueda (`q`) corrida server-side vía `ILIKE`
sobre IP/serial/marca/modelo/nombre/cliente/monitor — antes era un
`.filter()` client-side sobre las (hasta 5000) filas ya traídas.

**Bug real encontrado en el camino, no buscado**: la interfaz `Device` del
portal declaraba campos `ip`/`serial` que **el backend nunca envió**
(los reales son `ip_address`/`serial_number`) — confirmado con un `curl`
directo a la API. Significa que en esta página la IP y el número de serie
nunca se mostraron (siempre `undefined` en las cards) ni se pudieron
buscar client-side, desde que existe el componente. Corregido de paso.

**Segundo hallazgo, más grande**: `Devices.tsx` (el componente entero,
con agrupado por cliente, búsqueda, cards) **no estaba registrado en el
router ni en el menú** — código huérfano, inalcanzable desde la UI. Esto
resignifica el hallazgo original: "sin paginación" no era (sólo) que
faltara construir la paginación, sino que la página que la iba a tener
nunca llegó a conectarse — quienquiera que necesitara un inventario global
de equipos debía usar vistas menos escalables (por cliente, por monitor).
Se registró la ruta (`/devices` en `App.tsx`) y un ítem de nav nuevo
("Dispositivos", ícono `Printer`) dentro del grupo "Gestión de Clientes"
en `Layout.tsx`, visible para cualquier rol autenticado (mismo criterio
que "Clientes": el backend ya scopea por `client_id` para `client_viewer`,
confirmado por el test de RBAC existente).

Refactor chico de paso: `useDebounce` vivía duplicado e inline dentro de
`Layout.tsx` (usado por el buscador global `Ctrl+K`) — se extrajo a
`shared/hooks/useDebounce.ts` y `Devices.tsx` lo reusa para el debounce
de 300ms de su propio buscador, en vez de escribir una segunda copia.

Verificado de punta a punta contra el stack Docker real (no sólo tests):
`deviceLifecycle.test.ts`/`rbac.test.ts` actualizados al nuevo contrato
`{items, total}` (antes asumían un array plano) — sin usar el `total`
global de la base como invariante de test (con paginación real no tiene
sentido), sino filtrando por el serial único del fixture, doble uso:
prueba decommission/recommission Y la búsqueda nueva a la vez. CI completo
32/32 archivos en 0. Playwright real: click en el ítem de nav nuevo →
aterriza en `/devices`; buscar por un serial único → 1 resultado con la
IP real visible (confirma el fix `ip_address`); "Página 1 de 37" con la
flota real de prueba; click en "Siguiente" → cambia el contenido (offset
real, no una ilusión client-side) → "Página 2 de 37"; cero errores de
consola en todo el flujo.

### R10 · Documentación divergente — **P2** — los 2 documentos citados, actualizados (25/08/2026)
✅ `docs/security/data_collection_inventory.md` y
`docs/cliente/STC_Auditoria_Sistemas_IT_v1.7.html` actualizados a v2.1,
verificado contra el código (no supuesto). Hallazgo: "PBKDF2 100k" y "la
cascada vieja" ya estaban correctos en ambos documentos (210k
iteraciones, cascada de negociación real) — quedaron desactualizados en
ESTE mismo doc, no en los que describía. Lo que sí faltaba de verdad: un
§2.5 nuevo en el inventario de datos cubriendo cuentas de operador del
portal + 2FA, auditoría de login (usuario+IP, sin purga) y direcciones de
email de destinatarios de reportes/alertas — la conclusión ejecutiva "cero
PII" de v2.0 no distinguía el agente (sin PII, sigue siendo cierto) del
portal (sí procesa datos de personas identificadas del staff de IT del
cliente, nunca de usuarios finales); y la primera capacidad de SNMP SET
del sistema (reinicio remoto de impresora, agente v1.2.0) documentada en
ambos — "SNMP sólo identificación" era cierto hasta ayer, ahora hay una
excepción explícita, auditada y acotada. `email_log` sumado a las tablas
de retención de ambos (12 meses, ya purgado pero nunca documentado).

**Fuera de esta pasada, sigue igual que antes:** el resto de "Ver §1" —
documentación más antigua/dispersa que no forma parte de los 2 documentos
que este hallazgo nombraba explícitamente.

---

## 4. Roadmap propuesto para pasar "por encima de lo básico"

### Fase 0 — Parar hemorragias (1–2 semanas) — ✅ completa (ver "Estado de implementación")
1. ✅ `purgeOld`: borrar sólo `synced = 1`; lo no sincronizado se conserva (o se archiva) y se alerta. Backpressure en los 3 loops. Queue size en el heartbeat.
2. ✅ Idempotencia: `reading_id` UUID por lectura + `batch_id`; servidor `ON CONFLICT DO NOTHING` con unique `(device_id, time)`; respuesta con `accepted/rejected` por lectura.
3. ✅ Migración de reconciliación: hypertable + compresión + `readings.supplies_details` + índices `(device_id,time)`, `alerts(device_id,resolved)`, `audit_logs(created_at)`. Quitar el hack `.ts↔.js`. ✅ `add_retention_policy` (23/08/2026): `readings` 24 meses nativo TimescaleDB; `agent_logs` 90 días y `alerts` resueltas 12 meses vía job app-level (`retentionJob.ts`); `audit_logs` sin purga (write-only, decisión de negocio). Agregados continuos siguen sin implementarse (Fase 2).
4. ✅ Detección de reset/decremento en servidor al ingerir (marcar lectura, abrir alerta `counter_reset`) y en el cálculo mensual (sumar deltas positivos en vez de `MAX−MIN`).
5. ✅ Seguridad mínima: CSRF (double‑submit), quitar login por env, no devolver token en body¹, `trustProxy`, schema en `PUT /agents/:id/config` y `createClient`, audit en deletes/comandos. ✅ WS ya no acepta el JWT de sesión por query string — nota desactualizada, ver R4 (parcial, 23/08/2026) más abajo: reemplazado por un ticket de un solo uso de 60s (`wsTicketService.ts`).
6. ✅ Operación: `restart: unless-stopped`, `/health` real (DB+Redis), límites de recursos, `USER node`, `npm ci`; sacar binarios/dumps/secretos del repo y rotar `JWT_SECRET`/DB password.
7. ✅ Una sola fuente de versión: hecho en agente/cloud (`version.ts`); sincronizada automáticamente con el instalador Inno Setup, el `.csproj` del Monitor UI y `agent/package.json` vía `installer/build-installer.bat` (ver R6, corrección 25/08/2026 — el mecanismo ya existía, sólo le faltaba `package.json`). ✅ (23/08/2026) `capture.test.ts` y e2e de `cloud` corren en CI (Postgres/Redis como service containers en `.github/workflows/ci.yml`, job `api`).

¹ `/portal/me` y la respuesta de login siguen devolviendo el token también en el body (fallback para el WS cuando no hay cookie entre orígenes) — es una decisión consciente, no un pendiente.

### Fase 1 — Paridad operativa con SDS (≈ 1 mes) — completa: 9 de 9 ítems cerrados
- ✅ **Alert loop** — lifecycle server-side completo: alertas `agent_offline`, `device_offline`, `counter_reset` (ya de Fase 0), normalización de las alertas EWS que ya llegaban del agente; **ack/resolve** y filtros; **notificaciones** email + webhook. ✅ (25/08/2026) **digest diario de alertas por email**: opt-in por cliente vía `notification_events` (`alert.digest`, reusa el mecanismo de Fase 4.3, no un boolean paralelo), envío único diario a las 07:00 hora local del cliente (`America/Argentina/Buenos_Aires`), con conteo de críticas/advertencias abiertas + top de clases de alerta de las últimas 24h; idempotente vía `clients.last_alert_digest_sent_at` (`jobs/alertDigestJob.ts`). ⬜ El loop *dedicado 3/15 min del lado agente* no se tocó (las alertas del agente siguen en el loop de supplies, 60/240 min).
- ✅ **Reportes por cliente**: selector de período, cierre mensual inmutable (lectura inicial/final, delta, fuente), export CSV/XLSX, y **entrega automática** (email/webhook) para reemplazar el flujo FTP/mail del STC legado. ⬜ Export a PDF y entrega por SFTP no se hicieron (quedó CSV/XLSX + email/webhook).
- ✅ **RBAC por cliente**: rol `client_viewer`, scoping por `client_id` en todos los controladores. ✅ (25/08/2026) Paginación server-side real en el primer listado (`GET /devices` + `Devices.tsx`, ver R9) — el resto de las tablas del portal la siguen sin tener.
- ✅ **SNMPv3 y lista de credenciales** (v1/v2c/v3) por agente, hasta 8 credenciales probadas en orden, secretos cifrados at-rest, fail-fast para no multiplicar timeouts contra un host muerto.
- ✅ **CIDR + tope de rango + exclusiones**: `ip_ranges` acepta CIDR y exclusión de IPs individuales, compilado del lado cloud a pares planos (cero cambios en el agente); tope de 2000 IPs declaradas por agente, validado en cloud y reforzado en el agente. ⬜ Exclusión de sub-rangos/CIDR anidados e IPv6 quedan fuera.
- ✅ **Horario laboral y TZ configurables** por agente: `agents.business_hours` (jsonb, default = comportamiento hardcodeado de siempre), enviado en heartbeat config; de paso corrige el offset `-03:00` hardcodeado al ingerir logs/lecturas naive de agentes viejos, usando el TZ real del agente. ⬜ Cosmética de locale del portal (`es-AR`) queda para una pasada de polish aparte.
- ✅ `scan_schedule`: eliminado como código muerto (columna, tipo, y todo su manejo en cloud) — se había implementado y reemplazado deliberadamente por el modelo de 3 loops + horario laboral 4 días después, en mayo; el backend nunca se limpió hasta ahora. No se reimplementó: sin spec vigente que pida un scheduler tipo cron conviviendo con horario laboral.
- ✅ **Resolución de hostname (point lookup) + credenciales SNMP por rango**: `ip_ranges` acepta un tercer tipo de entrada `{hostname}` resuelto por el agente en cada ciclo (el cloud no tiene visibilidad de la DNS interna del cliente); cada entrada admite `credential_ids?` para restringir qué credenciales se prueban en ESE rango durante discovery, con fail-open ante ids colgantes y warnings no bloqueantes (rangos superpuestos con credenciales distintas, borrado de una credencial referenciada). ⬜ UI de asignación de `credential_ids` en el portal queda para después (API-only); restricción por rango en meter/supplies no se hizo (`known_devices` no tiene vínculo a rango, y no aporta valor real ahí).
- ✅ Identidad `(client_id, serial)` + MAC secundaria + merge de duplicados; decommission/mover/editar dispositivo.

### Fase 2 — Diferenciación (2–3 meses) — arrancada: 5 de 7 ítems cerrados
- ✅ (23/08/2026) API pública con API keys por cliente + webhooks (lecturas, alertas, cierres) → integración ERP. UI de portal ya hecha (23/08/2026). ✅ (25/08/2026) Retry/expiración automáticos — ver Fase 8 en "Estado de implementación". ✅ (26/08/2026) Documentación OpenAPI/Swagger — ver Fase 9.
- ✅ (23/08/2026) Remote EWS por túnel sobre el WSS existente (allowlist en dos capas, staleness, audit) — sólo el acceso EWS en sí, sin paridad IMIL completa (MIB walk remoto, deshabilitar monitoreo, reenviar lecturas, descubrir IP puntual quedan pendientes). Ver "Estado de implementación".
- Backend multi‑réplica: pub/sub Redis para WS, jobs BullMQ repetibles (heartbeat monitor), métricas Prometheus, Sentry. ✅ (23/08/2026) **Sub-ítem cerrado**: logs estructurados con pino en vez de `console.log` (`cloud/src/logger.ts`), sin dependencia de ninguna decisión de arquitectura pendiente — ver "Estado de implementación". El resto (pub/sub Redis, BullMQ repeatable, Prometheus, Sentry) sigue sin tocar.
- ✅ (23/08/2026) Agregados continuos (diario/mensual por equipo, `readings_daily_agg`/`readings_monthly_agg`) — sólo backend/endpoint, sin dashboard de portal todavía. Ver "Estado de implementación".
- Familias nuevas: Ricoh WIM, Kyocera CCX, Brother BMS, Xerox WS, Canon, Konica; fixtures reales por modelo; matriz de cobertura de scopes visible en el portal (columna Driver + scopes).
- ✅ (23/08/2026) Agente: rollback de update (single-file, verificado contra Windows real; el parche ZIP sólo backup manual), activación offline (retry con backoff), dedupe de lecturas idénticas (4h), detección de PJL deshabilitado, log rotation real, "mantener datos" al desinstalar (compilación verificada con Inno Setup 6.7.1 real, falta correr instalación/desinstalación de punta a punta) — ver "Estado de implementación".
- ✅ (23/08/2026) Documentación: comparativa v2.0, inventario de datos (privacidad) y auditoría IT reescritos reflejando todo lo de esta pasada (SNMPv3, identidad, EWS remoto, retención, API pública, resiliencia de agente); retención formalizada dentro del inventario y la auditoría IT. Falta: **DPA** (Data Processing Agreement) — deliberadamente NO redactado, es un documento contractual/legal que requiere revisión de abogado, no una tarea de documentación técnica.

---

## 5. Lo que SDS no tiene y STC sí (mantener y vender)
- Multimarca con perfiles por modelo y Printer‑MIB como red de seguridad.
- Un solo puerto 443 (SDS necesita 5222 XMPP + 443 + CRL por 80).
- Sync cada 5 min vs 1×/día para contadores.
- Insumos con part number, serial CRUM, páginas impresas/restantes, fechas; bandejas con tamaño/tipo; datos de configuración HP (paquete FS, RAM, ciclos de motor).
- Consola remota de diagnóstico y `--status` JSON para Intune/SCCM.
- Agente firmado (Ed25519) con hardware binding y sin dependencia de HP Cloud.

---

*Generado a partir de la lectura de toda la documentación del repositorio y de una auditoría del código al 21/08/2026. Las citas `archivo:línea` corresponden al working tree de ese día.*
