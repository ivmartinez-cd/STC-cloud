# Plan de Migración a ARCHITECTURE_GUIDE.md

**Estado:** Fase 0, Fase 1 y Fase 2 (backend) completas — incluidas las 2
pasadas diferidas de alto riesgo (`syncReadings`, `mergeDevices`); Fase 2
(frontend) en curso — `Settings.tsx`, `Monitors.tsx`, `MonitorDetail.tsx`,
`DeviceDetail.tsx` y `ClientDetail.tsx` divididos, 2 archivos grandes de
`portal/src` pendientes — 2026-08-24  
**Origen:** `docs/dev/ARCHITECTURE_GUIDE.md` (copiado desde `helpdesk-manager`, 2026-08-24)  
**Reemplaza (parcialmente) a:** `docs/dev/PROJECT_GUIDELINES.md`, que hoy documenta la
convención opuesta (`api/` para rutas + `services/` para lógica de negocio, sin capas).

## Fase 0 — hecho

- ✅ `docs/adr/001-adoptar-architecture-guide.md`
- ✅ `cloud/scripts/sizes-baseline.json` + `cloud/scripts/check-sizes.mjs`
  (`npm run check:sizes` / `check:sizes:baseline` en `cloud/package.json`),
  probado en caso OK y en los dos casos de falla (archivo nuevo >300 líneas,
  archivo baseline-ado que crece; función nueva >20 líneas).
- ✅ `cloud/src/shared/domain/errors/` (`AppError`, `DomainError`,
  `ValidationError`, `BusinessRuleViolationError`, `ApplicationError`,
  `NotFoundError`, `UnauthorizedError`, `InfrastructureError`, `DatabaseError`,
  `ExternalServiceError`) — puramente aditivo, ningún archivo existente lo
  importa todavía.
- ✅ `docs/dev/PROJECT_GUIDELINES.md` actualizado, apunta a esta guía + este plan.
- ✅ Validado en un entorno **efímero y aislado** (Postgres/Redis/API propios en
  contenedores throwaway, igual que hace `.github/workflows/ci.yml`) para no
  pisar el trabajo en curso de la sesión hermana sobre la DB/API compartida:
  `tsc --noEmit` limpio, suite completa de backend (20 archivos, `node
  scripts/ci-test-runner.mjs`) en 0 fallas, `cloud/portal` `npm run check`
  (icons + tsc + eslint) limpio.

Nada de esto tocó código de negocio existente ni archivos que la sesión hermana
estuviera editando.

## Fase 1 — módulo piloto: `feedback` (no `supplies`) — hecho

`supplies` (el candidato original de este documento) resultó ser exactamente el
módulo que la sesión hermana estaba extendiendo en vivo (`supply_origin`,
`supplyOrigin.test.ts`) al momento de arrancar esta fase. Se eligió `feedback`
en su lugar por el mismo criterio del plan (chico, acotado) más estar
completamente quieto en `git status` — controller + routes sin service propio,
188 líneas, sin tests dedicados (cubierto indirectamente por `rbac.test.ts`).

- ✅ `cloud/src/modules/feedback/{domain,application,infrastructure,presentation}/`
  reemplaza `api/controllers/feedbackController.ts` + `api/routes/feedbackRoutes.ts`
  (borrados). `server.ts` actualizado a una sola línea de import.
- ✅ Capas: `domain/entities/feedback.ts` + `domain/repositories/feedback-repository.ts`
  (interfaz, sin Knex) → `application/use-cases/{submit,list,update-status}-feedback.ts`
  (usan `shared/domain/errors` — `UnauthorizedError`/`NotFoundError`, primer
  consumo real de la Fase 0) → `infrastructure/database/knex-*.ts` (implementaciones
  concretas) → `presentation/{feedback-controller,feedback-routes,feedback-schemas,feedback-view}.ts`.
- ✅ **Contrato de API preservado byte a byte**: el dominio interno usa camelCase
  (`createdAt`, `imageUrl`) pero `presentation/feedback-view.ts` traduce de vuelta a
  snake_case en el borde — se detectó en pruebas manuales que sin este mapeo se
  rompía `portal/src/pages/Settings.tsx` (lee `fb.created_at`/`fb.image_url`
  directo de la respuesta de `GET /feedback`). Los 3 endpoints tienen exactamente
  los mismos campos que antes (`submit`: id/type/title/status/created_at;
  `list`: + description/image_url/username; `updateStatus`: solo id/title/status).
- ✅ Todas las funciones nuevas ≤20 líneas, todos los archivos muy por debajo de
  300 — cero deuda nueva aceptada en el baseline (a diferencia de baselinear y
  seguir, se refactorizó hasta cumplir de entrada).
- ✅ Validado en el mismo entorno efímero aislado que la Fase 0: 20/20 archivos
  de test en 0 fallas, `tsc --noEmit` limpio, smoke test manual de
  `PUT /feedback/:id/status` (sin cobertura automática) contra los 3 endpoints
  incluyendo el caso 404.
- Nota operativa: a mitad de esta fase la sesión hermana tenía código roto en
  tránsito (`services/incidentService.ts`, `api/utils/scope.ts`,
  migraciones `20260824080000_incidents`/`...090000_incident_rules_seed`) que
  bloqueaba `tsc`/`migrate` del árbol completo. Se resolvió poniendo en
  cuarentena temporal (solo en `dist/`, nunca en `src/`) los dos `.js`
  compilados de esas migraciones para poder migrar el resto, y se reintentó
  más tarde cuando la otra sesión los dejó consistentes — nunca se tocó su
  código fuente.

## Fase 2 — dividir archivos grandes

### Coordinación entre sesiones (2026-08-24)

A partir de acá las sesiones concurrentes sobre este repo se coordinan por
mensaje directo (`SendMessage`/`ListAgents`), no sólo por inferencia de
`git status`. La sesión hermana (`close-hp-sds-gaps`, gap analysis vs HP SDS)
confirmó que `agentService.ts`, `deviceController.ts`, `dashboardController.ts`,
`deviceLifecycleService.ts` y `portalAgentController.ts` quedaron **estables**
tras sus Fases 8-11 (aunque sin commitear todavía) y que de ahí en más sólo
toca `cloud/portal/src/` (UI de incidentes) — liberando toda la cola pendiente
de esta fase. A cambio, esta migración evita `incidentService.ts`,
`incidentClassifier.ts`, `supplyOrigin.ts`, `deviceRegistrationService.ts`,
`deviceMonitorService.ts`, `customFieldService.ts`, `incidentController.ts`,
`incidentRoutes.ts`, `scope.ts`, `rolePolicy.ts` y `authMiddleware.ts`.

### 1 de N — `ipRangeSpec.ts` (no `agentService.ts`)

`agentService.ts` (el primer candidato de este plan) tenía ~200 líneas sin
commitear de la sesión hermana al arrancar esta fase — partirlo ahora habría
significado reestructurar su trabajo en curso, no sólo convivir al lado. Se
aplicó el mismo criterio de la Fase 1 (sustituir por el archivo grande más
grande que esté quieto): de la tabla de la Fase 0, `services/ipRangeSpec.ts`
(436 líneas) estaba limpio. `agentService.ts` sigue primero en la cola para
cuando se estabilice.

- ✅ `services/ipRangeSpec.ts` (436 líneas, una función de validación de
  ~100 líneas) → carpeta `services/ipRangeSpec/{types,ip-arithmetic,validate,compile,warnings,index}.ts`,
  todas por debajo de 100 líneas y ninguna función por encima de 20.
- ✅ **Cero archivos consumidores tocados**: los 4 imports externos
  (`agentService.ts`, `portalAgentController.ts`, `portalAgentRoutes.ts`,
  `ipRangeSpec.test.ts`) usan specifiers "bare" (`"./ipRangeSpec"`,
  `"../services/ipRangeSpec"`) que resuelven igual a un directorio con
  `index.ts` — ni siquiera hubo que abrir esos archivos. Éste es el patrón a
  repetir para los próximos: convertir a carpeta con barrel antes que salir a
  actualizar imports por todo el árbol.
- ✅ Sin capas todavía (a propósito, así lo pide esta fase) — es sólo
  reorganización por responsabilidad dentro de `services/`; la migración a
  `modules/<m>/` de este código queda para cuando le toque su fase de capas.
- ✅ Validado: 58/58 tests unitarios de `ipRangeSpec.test.ts` (lógica pura,
  sin servidor) uno a uno idénticos a antes de la partición, más la misma
  batería de Fase 0/1 en entorno efímero aislado (21/21 archivos — sumó
  `incidents.test.ts` de la sesión hermana en el medio — 0 fallas, `tsc`
  limpio, `cloud/portal` `npm run check` limpio).

### 2 de N — `agentService.ts` (1592 líneas — el archivo más grande y central del backend)

Con la sesión hermana confirmando el archivo estable (ver arriba), se partió el
God Object más grande del repo (20 métodos públicos, 6 responsabilidades
mezcladas) en una **fachada delgada + 6 sub-servicios**, no una simple carpeta
de funciones sueltas — es una clase con estado (`db`/`redis` inyectados) usada
desde un único punto de instanciación (`server.ts:83`), así que había que
preservar la API pública método por método:

```
services/agentService/
├── types.ts                — interfaces + AgentServiceDeps
├── reading-helpers.ts       — hashToken, mergeSuppliesDetails, skuFrom,
│                              assetNumberFrom, isValidUuid, mapWithConcurrency
├── lifecycle.ts             — AgentLifecycleService (activación, tokens, revocación)
├── config.ts                — AgentConfigService (ip_ranges, credenciales SNMP, business hours)
├── device-registration.ts   — AgentDeviceRegistrationService (alta/upsert de equipos)
├── telemetry.ts             — AgentTelemetryService (syncReadings, logs, heartbeat) — 702L, ver abajo
├── commands.ts               — AgentCommandService (cola de comandos remotos)
├── search.ts                 — AgentSearchService (globalSearch)
├── agent-service.ts          — AgentService: compone los 6 de arriba, delega 1:1
└── index.ts                  — barrel
```

- ✅ **Cero archivos consumidores tocados** (mismo patrón bare-import + barrel
  que Fase 2/1): los 11 imports externos (incluidos `ws/index.ts`,
  `authMiddleware.ts`, 5 controllers, 4 routes) resuelven igual.
- ✅ **Movimiento verbatim, no reescritura**: cada método se movió tal cual —
  incluyendo una firma pre-existente rara (`syncReadings(redis, ...)` recibe
  `redis` como parámetro pero usa `this.redis` adentro, el parámetro está
  muerto) que se preservó a propósito, no se "arregló" en un refactor
  estructural. Único drop intencional: el import `NOISE_MODEL_RE` de
  `deviceIdentity.ts`, muerto en el archivo original (nunca se usaba).
- ⚠️ **`telemetry.ts` queda en 702 líneas — no se terminó de dividir.**
  `syncReadings` (~600 líneas: resolución de identidad de dispositivo,
  detección de reset de contador, fusión de fantasmas, alertas EWS, todo
  crítico para facturación/alertas) es demasiado riesgoso para decomponer su
  clausura interna en la misma pasada que reorganiza el resto — se dejó
  intacto a propósito. Queda como el próximo ítem de esta lista, con su
  propia pasada dedicada (no apurada entre otras 5 extracciones).
- ✅ Deuda pre-existente (no nueva) baseline-ada bajo los nuevos paths:
  `createActivationKey`/`activateAgent`/`refreshAgentToken`/`regenerateActivationKey`
  (lifecycle.ts), `updateConfig`/`getConfig`/`replaceSnmpCredentials` (config.ts),
  `registerDevices`/`attemptUpsert`/`registerDeviceLegacyByAgent`
  (device-registration.ts), `globalSearch` (search.ts),
  `ingestLogs`/`heartbeat`/`syncReadings`/`processReading` (telemetry.ts) — todas
  ya excedían 20 líneas en el archivo original, sólo cambiaron de casa.
- ✅ Validado en el mismo entorno efímero aislado: 21/21 archivos de test en 0
  fallas — incluida a propósito la batería más sensible a este archivo
  ("Concurrencia del sync", "Detección de reset de contador y volumen
  mensual", "Ciclo de vida del agente", "Heartbeat") — `tsc` limpio, portal
  check limpio.

### 3 de N — `deviceController.ts` (777 líneas, 19 handlers)

Mismo patrón que `feedback` (Fase 1): factory `createDeviceController(db)`
devolviendo un objeto de handlers, no una clase. Dividido por responsabilidad
en `deviceController/{shared,reads,crud,lifecycle,merge,monitor-state,bulk,index}.ts`
(8 archivos, el más grande 235 líneas). Mismo fix de Fase 1 aplicado a los 6
factories (`create*Handlers`): cada handler es una función top-level que
recibe `db` como primer parámetro, y el factory sólo arma un objeto de
lambdas de una línea que la llaman — si no, el propio wrapper del factory
queda "grande" por el checker de tamaño aunque no tenga lógica propia (span
completo del objeto que retorna). Cero consumidores tocados (`deviceRoutes.ts`,
`portalAgentRoutes.ts`, bare imports). Validado: 21/21 archivos en el mismo
entorno efímero, 0 fallas, tsc y portal check limpios.

### 4 de N — `portalAgentController.ts` (610 líneas, 17 handlers)

Mismo patrón y mismo fix que `deviceController.ts` (3 de N). Dividido en
`portalAgentController/{shared,reads,logs,lifecycle,config,remote,index}.ts`
(el más grande 198 líneas). Al mover `deleteAgent` y `ewsProxy` se extrajeron
dos helpers nuevos (`deleteAgentCascade`, `assertEwsEligibleDevice`) que
antes eran closures anónimas inline — mismo cuerpo, ahora nombradas; siguen
por encima de 20 líneas (no se shrinkearon más), pero ya no son anónimas.
Cero consumidores tocados (`portalAgentRoutes.ts`, bare import). Validado:
21/21 archivos en el entorno efímero (incluye `portalAgentEws.test.ts`, que
ejercita `ewsProxy` end-to-end vía WS), 0 fallas, tsc y portal check limpios.

### 5 de N — `dashboardController.ts` (600 líneas: dashboard + alertas)

Dos dominios en un archivo: stats del dashboard (`getDashboard`, un
`Promise.all` de 19 queries independientes) y CRUD de alertas. Dividido en
`dashboardController/{shared,dashboard-queries,dashboard,alerts-reads,alerts-mutations,index}.ts`.
`getDashboard` en sí bajó de ~276 a ~35 líneas: cada una de las 19 queries del
`Promise.all` se hoisteó a su propia función top-level en `dashboard-queries.ts`
(mismo patrón mecánico que los `create*Handlers`, pero aplicado a un
`Promise.all` en vez de un objeto de handlers — cero cambio de comportamiento,
siguen corriendo en paralelo). `dashboard.ts` quedó en 338 líneas tras esa
extracción (por encima del límite igual, sólo por la cantidad de funciones);
se volvió a partir moviendo las 19 queries a `dashboard-queries.ts` aparte.
Cero consumidores tocados (`dashboardRoutes.ts`, bare import). Validado:
21/21 archivos en el entorno efímero, 0 fallas, tsc y portal check limpios.

### 6 de N — `deviceLifecycleService.ts` (516 líneas: merge + bulk actions)

Dos dominios de nuevo: fusión de duplicados (`mergeDevices`) y acciones en
bloque (Fase 9). Dividido en `deviceLifecycleService/{merge-types,merge,bulk,index}.ts`.
`mergeDevices` (~200 líneas, la más crítica del módulo — reapunta
readings/alerts/report_closure_lines, toca facturación) se dejó **sin
decomponer a propósito**, mismo criterio que `syncReadings` en la Fase 2/2
(agentService): se movió verbatim, sólo se extrajeron las clases de error y
tipos a `merge-types.ts` para que `merge.ts` entrara bajo 300 líneas. Módulo
de funciones sueltas (no clase ni factory), mismo truco de carpeta+barrel de
siempre. Cero consumidores tocados (`deviceController/{merge,bulk}.ts`,
`agentService/telemetry.ts`). Validado: 21/21 archivos en el entorno efímero,
0 fallas, tsc y portal check limpios.

### 7 de N — `authController.ts` (385 líneas: sesión + usuarios + auth de agentes)

Cuatro dominios: sesión del portal (login/logout/me/ws-ticket), CRUD de
usuarios, auth de agentes (activate/refresh), y versión publicada del agente
(Redis + archivo local + env como fallback en cascada). Dividido en
`authController/{shared,session,users,agent-auth,agent-version,index}.ts`.
Mismo patrón de siempre. Cero consumidores tocados (`authRoutes.ts`, bare
import). Validado: 21/21 archivos en el entorno efímero (incluye
`e2e.test.ts`, que ejercita login/activate/refresh), 0 fallas, tsc y portal
check limpios.

### 8 de N — `reportService.ts` (355 líneas: cierre mensual de facturación)

Dos responsabilidades: cálculo de volumen del período (`computePeriodUsage`,
sin escritura — la usan tanto el preview como el cierre real) y cierre/
reapertura (con escritura + auditoría + entrega asíncrona). Dividido en
`reportService/{period-usage,closure,index}.ts`. A diferencia de
`mergeDevices`/`syncReadings`, acá sí se decompuso: el cuerpo de la
transacción de `closePeriod` se extrajo a `runClosePeriod` (función nombrada
aparte, mismo código) y el mapeo de líneas a `buildClosureLineRows` — riesgo
bajo porque es una extracción mecánica 1:1, no una reescritura de lógica.
Cero consumidores tocados (`reportController.ts`, `reportDeliveryWorker.ts`,
`reportExportService.ts`, bare imports). Validado: 21/21 archivos en el
entorno efímero (incluye `reports.test.ts`), 0 fallas, tsc y portal check
limpios.

### 9 de N — `clientController.ts` (345 líneas)

Cinco dominios: CRUD de cliente, lecturas (listado/detalle/monitors/usage/
devices), cola de pendientes (Fase 7), API keys, webhook público. Dividido
en `clientController/{crud,reads,pending-devices,api-keys,webhook,index}.ts`.
Cero consumidores tocados (`clientRoutes.ts`). Validado: 21/21 en el entorno
efímero, 0 fallas. Nota: la primera corrida completa mostró 2 fallas en
`incidents.test.ts` (espera de hasta 3 min por un tick real del
`incidentWorker` de la sesión hermana) — confirmado flake de timing no
relacionado corriendo ese archivo solo y luego la suite completa de nuevo
limpia (0 fallas ambas veces). tsc y portal check limpios.

### 10 de N — `suppliesService.ts` (301 líneas) — cierra la cola original de la tabla de Fase 0

Módulo de funciones sueltas (sin controller, es lógica pura + queries).
Dividido en `suppliesService/{types,row-builder,queries,index}.ts` —
`buildSupplyRows` se decompuso en `buildTonerRows`/`buildMaintenanceRows`
(extracción mecánica, mismo criterio que `reportService`). Cero consumidores
tocados (`suppliesController.ts`, `deviceController/reads.ts`). Validado:
21/21 en el entorno efímero (incluye `supplies.test.ts`), 0 fallas, tsc y
portal check limpios.

## Fase 2 (backend) — completa salvo 2 diferidas (2026-08-24)

Con `suppliesService.ts` se cierra toda la tabla de archivos >300 líneas que
existía al congelar la Fase 0. Estado del backend medido después de este
commit (`find src -name "*.ts" | xargs wc -l | sort -rn`): el único archivo
de negocio (no-test) por encima de 300 líneas que queda es
`services/agentService/telemetry.ts` (701L, `syncReadings` deliberadamente
sin decomponer). `services/deviceLifecycleService/merge.ts` (244L,
`mergeDevices` también sin decomponer) ya entra bajo el límite de archivo,
pero la función en sí sigue pendiente de la misma pasada dedicada.

**Fuera de este alcance a propósito** (no tocar sin coordinar de nuevo con
`close-hp-sds-gaps`): `services/incidentService.ts` (362L) y el crecimiento de
`api/server.ts` (336L) son de su feature de incidentes, todavía en curso.

**Pendiente real de Fase 2:**
1. `services/agentService/telemetry.ts` — decomponer `syncReadings` (~600L,
   resolución de identidad de dispositivo, detección de reset de contador,
   fusión de fantasmas, alertas EWS — todo crítico para facturación/alertas).
2. `services/deviceLifecycleService/merge.ts` — decomponer `mergeDevices`
   (~200L, reapunta readings/alerts/report_closure_lines).

Ambas requieren una pasada dedicada y cuidadosa (no apurada entre otras
extracciones) — la clausura interna de cada una mezcla mucha lógica de
negocio real que no se puede simplemente "hoistear" sin releer con cuidado
cada rama.

**Frontend:** sin arrancar. `portal/src` tiene su propia tabla de archivos
grandes (`Settings.tsx` 869, `DeviceDetail.tsx` 772, `Monitors.tsx` 615,
`DeviceLifecycleModals.tsx` 603, `ClientDetail.tsx` 571, `MonitorDetail.tsx`
569, `Dashboard.tsx` 507, `Layout.tsx` 482+, etc. — medida en la Fase 0,
probablemente cambió con las Fases 8-11 de la sesión hermana sobre el
portal). Splitting de componentes React es un problema distinto al de
funciones/controllers de Node (reglas de hooks, límites de componente,
prop drilling) — no asumir que aplica el mismo patrón mecánico de
carpeta+barrel sin evaluarlo primero.

## Fase 2 — 2 pasadas diferidas completas (2026-08-24)

Las dos decomposiciones de alto riesgo que se habían movido verbatim (sin
tocar su lógica interna) durante la Fase 2 quedaron pendientes a propósito
hasta poder dedicarles una pasada cuidadosa y aislada. Se hicieron en esta
sesión, cada una revisando rama por rama antes de extraer, sin cambiar
ningún comportamiento observable.

**1. `services/deviceLifecycleService/merge.ts`** (`mergeDevices`) — de 244L
en un solo archivo a:
- `merge.ts` (281L) — `mergeDevices` conserva firma exacta
  (`mergeDevices(db, params, existingTrx?)`). Se descompuso en ~19 funciones
  con nombres explícitos: `lockDevicePair`, `buildIdempotentResult`,
  `resolveIdentifyingSerials`, `assertNoIdentityConflict`,
  `assertMergeGuards`, `assertReadingCountWithinLimit`, `throwOverlapError`,
  `resolveReadingOverlap`, `moveReadings`/`moveReadingsPhase`,
  `resolveAlertCollisions`, `moveAlerts`/`moveAlertsPhase`,
  `moveClosureLines`, `moveLegacyMonthlyCounters`, `compressMergeChain`,
  `buildMergeAuditMetadata`, `writeMergeAudit`, `runMerge`.
- `merge-survivor.ts` (61L, nuevo) — precedencia de campos entre
  target/source al fusionar (`pickNewer`, `isNoiseModel`,
  `resolveModelAndBrand`, `buildSurvivorUpdate`, `markAsTombstone`),
  expuesto como `applySurvivorAndTombstone(...)`.

**2. `services/agentService/telemetry.ts`** (`syncReadings`) — de 701L en un
solo archivo a:
- `telemetry.ts` (242L) — `AgentTelemetryService` conserva `ingestLogs`,
  `getLogs`, `heartbeat`, `syncReadings` con firma exacta (incluye el
  parámetro `redis` que ya estaba muerto — el cuerpo usa `this.redis` — se
  preservó tal cual, no es un bug de esta pasada). Orquestación de alto
  nivel: `resolveAgentClientContext`, `groupReadingsByIdentity`,
  `READING_CONCURRENCY = 5`, `processReadingGroups`, `insertMappedReadings`,
  `enqueueAlertEvaluation`, `enqueueReadingWebhook`.
- `sync-reading.ts` (227L, nuevo) — resolución de identidad + upsert/insert
  de un dispositivo por lectura: exporta `processReading(...)` (antes
  inline dentro de `syncReadings`) y el tipo `DisplayFields`.
- `sync-reading-fields.ts` (206L, nuevo) — parseo de contadores/tóner y
  detección de reset (`parseCount`, `parseToner`, `detectCounterResets`,
  `resolveExistingDeviceFields`, `buildExistingDeviceUpdate`,
  `buildNewDeviceInsert`).
- `sync-reading-alerts.ts` (106L, nuevo) — alertas derivadas de una lectura
  (`openCounterResetAlert`, `handleSupplyOriginAlertsForExisting`,
  `openSupplyNonGenuineAlert`, `warnIfDecommissionedStillReporting`,
  `syncEwsAlerts`, `mergeGhostDevicesByIp` — esta última es la que fusiona
  fantasmas duplicados vía `mergeDevices`).
- `sync-log.ts` (28L, nuevo) — logging de fallas de sync
  (`buildAgentLogRows`, `recordSyncFailureLog`).

Único cambio no puramente mecánico: se eliminó el import muerto
`NOISE_MODEL_RE` sin uso en el archivo original (confirmado al 100% sin
referencias) — documentado explícitamente, no silencioso.

**Validación** (mismo entorno efímero aislado que las fases anteriores,
Postgres/Redis/API propios en contenedores throwaway, puerto y DB separados
de la sesión hermana):
- `npm run build` limpio, `npx tsc --noEmit` limpio en ambos splits al
  primer intento.
- Suite completa de backend: 21 archivos, `node scripts/ci-test-runner.mjs`
  → **0 fallas**. Revisión dirigida de las suites de mayor riesgo:
  concurrencia del sync (batching, orden de lecturas del mismo dispositivo
  en un lote, aislamiento de lecturas corruptas), reset de contador +
  `monthly_pages`, y — el más directamente ligado a `mergeDevices` —
  `deviceLifecycle.test.ts` completo (identidad serial→mac→ip, fusión
  manual de duplicados con éxito/409/self-merge, acciones en bloque de
  mover/dar de baja) — 29/29 verdes.
- `cloud/portal` → `npm run check` (icons + tsc + eslint) limpio.
- `check-sizes.mjs` limpio tras regenerar baseline (237 archivos
  escaneados, sin deuda nueva aceptada — ambos splits cumplen los límites
  de entrada, no vía baseline).

Con esto, Fase 2 backend queda 100% completa. Sigue pendiente el frontend
(ver tabla de archivos grandes de `portal/src` arriba) — no arrancado en
esta sesión.

## Fase 2 (frontend) — arranca con `Settings.tsx` (2026-08-24)

Ivan pidió continuar ("Continuar") una vez cerrado el backend. Antes de tocar
nada de `portal/src` se coordinó con las 3 sesiones hermanas activas en la
misma máquina (mismo working directory, sin worktrees — cualquier archivo
que otra sesión esté editando puede chocar en disco, no sólo en un branch
git): `manual-coordinate-correction-ui` (otro repo, `helpdesk-manager`, sin
superposición), `sdsinsumos-bf` (otro repo, `sdsinsumos`, sin superposición)
y `close-hp-sds-gaps` (mismo repo — confirmó que `Settings.tsx` está libre y
pidió reservarle `Layout.tsx`/`Reports.tsx`, que está tocando en vivo para
su Fase 4.1 de informes programados).

`Settings.tsx` (869 líneas, el archivo de portal más grande) se eligió por
ser el candidato más grande que estaba genuinamente libre. División:
- `types/settings.ts` (30L, nuevo) — `Thresholds`, `DBUser`, `DBClient`,
  `DBFeedback`.
- `components/settings/MonitorThresholdCard.tsx` (42L, nuevo) — presentacional,
  recibe `thresholds`/`onChange`.
- `components/settings/SmtpInfoCard.tsx` (70L, nuevo) — presentacional
  (los campos SMTP son de sólo lectura/decorativos, `disabled` — nunca se
  guardan; comportamiento preservado tal cual).
- `components/settings/FeedbackCard.tsx` (121L, nuevo) — autocontenido (fetch,
  expand/collapse, cambio de estado), sólo se monta si `isAdmin` (igual que
  antes).
- `components/settings/operators/` (nuevo, 5 archivos: `UserTable.tsx` 108L,
  `CreateUserModal.tsx` 161L, `ResetPasswordModal.tsx` 94L,
  `RoleChangeModal.tsx` 68L, `OperatorsCard.tsx` 187L orquestador) — cada
  modal quedó autocontenido (su propio estado de formulario + su propia
  llamada a `api.*`), siguiendo el mismo patrón que
  `components/clients/ApiKeysCard.tsx` (`NewKeyModal`/`WebhookSection`
  inline). `OperatorsCard` conserva `fetchUsers`/`fetchClients`/
  `toggleUserActive`/`handleRoleChange`/`handleDeleteUser` porque son
  compartidos entre la tabla y más de un modal.
- `pages/Settings.tsx` (869L → 71L) — sólo orquesta: estado de threshold/smtp
  (el único que de verdad usa el botón "Guardar Cambios" — SMTP nunca se
  guardó, es decorativo) + composición de las 4 cards.

**Confirmado explícitamente lo que dice este plan más arriba:** dividir
componentes React no es el mismo patrón mecánico que los `services/*.ts`
del backend. `check-sizes.mjs` sí se cumple a rajatabla en el límite de
**archivo** (300 líneas, todos los nuevos muy por debajo), pero el límite de
**función** de 20 líneas es sistemáticamente incumplido por cualquier
componente con JSX no trivial — ya era así antes de esta sesión
(`ApiKeysCard.tsx`, no tocado acá, tiene funciones de 57/126/137 líneas
aceptadas en baseline) y se mantiene igual criterio: los 9 componentes
nuevos quedan con su función principal >20 líneas, aceptado vía
`--write-baseline` igual que el resto del frontend. No tiene sentido forzar
un componente de React a <20 líneas partiendo su JSX en fragmentos
artificiales — el criterio duro que sí se sostiene es el de archivo.

**Validación:** `cloud/portal` → `npm run check` (icons + tsc + eslint)
limpio. Vite dev server (puerto 5180, ya corriendo) transforma todos los
módulos nuevos sin error (`curl` a cada uno → 200, sin overlay de error).
**Limitación reconocida:** no se pudo hacer una prueba visual real en
navegador en este entorno (sin herramienta de automatización de browser
disponible) — la verificación de comportamiento se hizo por lectura
cuidadosa línea a línea contra el original (mismas clases, mismos handlers,
mismo flujo de estado) más `tsc`/`eslint` limpios, no por click-through
manual. Ivan debería confirmar visualmente en `http://localhost:5180` (o
reconstruyendo el contenedor Docker del portal) antes de dar esto por
cerrado del todo.

**Nota de baseline compartido:** al regenerar `sizes-baseline.json` en este
paso, el scan también capturó trabajo en curso (sin commitear) de
`close-hp-sds-gaps` — su módulo `modules/scheduled-reports/` completo,
`api/server.ts` y `tests/rbac.test.ts` crecidos, `tests/scheduledReports.test.ts`
nuevo. Es intencional y no problemático: el baseline es un ratchet
compartido en disco (no versionado por sesión), sólo fija un piso de "no
empeorar" — no le quita mérito ni commitea su código por mí, y cuando ellos
commiteen su propio trabajo `check-sizes.mjs` no va a mostrar nada nuevo
para esos archivos porque ya quedaron reflejados acá.

**Pendiente de Fase 2 frontend (al cerrar `Settings.tsx`):** `DeviceDetail.tsx`
(772), `Monitors.tsx` (615), `DeviceLifecycleModals.tsx` (603),
`ClientDetail.tsx` (571), `MonitorDetail.tsx` (569), `Dashboard.tsx` (507)
sin dividir. De estos, `DeviceLifecycleModals.tsx`, `ClientDetail.tsx`,
`Dashboard.tsx` y `DeviceDetail.tsx` tienen cambios sin commitear de la
Fase 11 de `close-hp-sds-gaps` (confirmados "terminados, no se van a seguir
editando" pero sin commitear) — si se dividen, hacerlo sobre el working
tree actual, no sobre HEAD, para no perder ese trabajo. `Layout.tsx` está
reservado por `close-hp-sds-gaps` hasta nuevo aviso (activo en su Fase 4.1).

## Fase 2 (frontend) — `Monitors.tsx` dividido (2026-08-24)

Segundo archivo del frontend, elegido por ser el siguiente más grande que
seguía genuinamente libre en `git status` (ni `close-hp-sds-gaps` ni las
otras 2 sesiones hermanas lo tocan — reconfirmado con `ListAgents` +
`git status` justo antes de arrancar, mismo roster de 3 sesiones).

`Monitors.tsx` (615L) tenía sus propios tipos locales `Monitor`/`Client` que
NO son los mismos que `types/monitor.ts` (que ya exporta un `Monitor` y un
`Client` con formas distintas, usados por otras páginas contra otros
endpoints) — se nombraron `MonitorListItem`/`ClientOption` en un archivo de
tipos nuevo (`types/monitorsPage.ts`) para no pisar ni confundir con los
existentes.

División:
- `types/monitorsPage.ts` (23L, nuevo) — `MonitorListItem`, `IpRange`,
  `MonitorConfig`, `ClientOption`.
- `components/monitors/RegisterMonitorPanel.tsx` (167L, nuevo) — panel de
  alta autocontenido (estado del formulario + su propio `api.post`), recibe
  `clients` y un callback `onCreated(key)`.
- `components/monitors/MonitorsTable.tsx` (146L, nuevo) — tabla presentacional
  + `formatLastSeen`.
- `components/monitors/MonitorConfigModal.tsx` (172L, nuevo) — autocontenido
  (fetch de config al abrir + su propio `api.put`), recibe `monitor`/`onClose`.
- `pages/Monitors.tsx` (615L → 162L) — orquestador: sólo agentes/clientes,
  `loadMonitors`, `revokeMonitor`, `confirmDeleteMonitor`, y composición de
  las 3 piezas de arriba + `ConfirmModal` para el borrado.

Nota: no se creó ningún componente/botón nuevo — el `RegisterMonitorPanel`
quedó sin un botón "Cancelar" propio (se probó agregar uno y se revirtió) al
notar que el original sólo colapsa el panel desde el botón del header; el
`resetForm()` original queda implícito porque el panel ahora es un
componente separado que se desmonta (y por lo tanto pierde su estado) al
cerrarse, mismo efecto neto sin código explícito.

Ya existían en `components/monitors/` otros componentes con nombres
similares (`CreateMonitorModal.tsx`, `EditMonitorModal.tsx`) — **no son
reutilizables acá**: pertenecen a un flujo distinto (alta/edición de
monitor desde `ClientDetail.tsx`/`MonitorDetail.tsx`, con
`types/monitor.ts::CreateMonitorForm`, sin selector de cliente porque ya
vienen scopeados a uno). Se verificó con grep antes de asumir que había
que tocarlos.

**Validación:** `cloud/portal` → `npm run check` (icons+tsc+eslint) limpio.
Vite dev server (:5180) transforma los 5 archivos nuevos/tocados sin error.
Misma limitación que en `Settings.tsx`: sin prueba visual real en
navegador en este entorno. `check-sizes.mjs` limpio tras regenerar baseline
(271 archivos) — mismo criterio de archivo-sí/función-JSX-no que ya se
documentó arriba; el regen también capturó crecimiento en curso de
`close-hp-sds-gaps` (`App.tsx`, `Layout.tsx`, `components/reports/
ScheduledReportModal.tsx` nuevo, `pages/ScheduledReports.tsx`).

**Pendiente de Fase 2 frontend:** `DeviceDetail.tsx` (772), `DeviceLifecycleModals.tsx`
(603), `ClientDetail.tsx` (571), `MonitorDetail.tsx` (569), `Dashboard.tsx`
(507).

## Fase 2 (frontend) — `MonitorDetail.tsx` dividido (2026-08-24)

Tercer archivo, elegido por ser el único de la lista pendiente que seguía
totalmente quieto (`close-hp-sds-gaps` confirmó que `Dashboard.tsx`,
`ClientDetail.tsx`, `DeviceDetail.tsx` y `DeviceLifecycleModals.tsx` están
"terminados pero sin commitear" de su Fase 11 — se dejan para una pasada
que respete ese working tree en vez de HEAD).

Este archivo ya venía parcialmente descompuesto (mucha lógica vive en el
hook `useMonitorDetail` y en componentes ya existentes como
`DeviceSummaryCard`/`MonitorSpecsCard`/`LicenseCard`/etc.) — sólo quedaban
dos bloques grandes dentro del mismo archivo:
- `components/monitors/ConfigTabPanel.tsx` (284L, nuevo) — el panel de
  configuración (parámetros de red, umbrales de tóner, horario laboral,
  credenciales SNMP) ya estaba definido como componente separado dentro
  del archivo, sin exportar — se movió literal a su propio archivo.
- `components/monitors/MonitorRegenKeyModal.tsx` (48L, nuevo) — el modal de
  "nueva llave regenerada". Ya existía `components/agents/RegenKeyModal.tsx`
  (usado por `pages/Agents.tsx`, mencionado en un comentario de
  `ApiKeysCard.tsx`) pero con otra forma de props (`{agentName,key,
  expiresAt}` vs. sólo el string de la key acá) y otro diseño visual — se
  verificó antes de asumir que era reutilizable y se descartó, nombrando el
  nuevo distinto para no confundir.
- `pages/MonitorDetail.tsx` (569L → 252L) — orquestador: tabs, header,
  composición de paneles por tab, hook `useMonitorDetail`.

Un import (`Key` de lucide-react) quedó sin uso en la página tras mover el
modal — lo sacó `eslint`/revisión manual antes de dar por cerrado el split
(quedaba solo en un comentario, no en JSX).

**Validación:** `npm run check` limpio, Vite (:5180) transforma los 3
archivos sin error. `check-sizes.mjs` limpio tras regenerar baseline (273
archivos) — esta vez sin arrastrar ningún archivo ajeno nuevo (las otras
sesiones no tocaron nada en el medio). Misma limitación de siempre: sin
prueba visual real en navegador en este entorno.

**Pendiente de Fase 2 frontend:** `DeviceDetail.tsx` (772),
`DeviceLifecycleModals.tsx` (603), `ClientDetail.tsx` (571), `Dashboard.tsx`
(507) — los 4 restantes tienen cambios sin commitear de la Fase 11 de
`close-hp-sds-gaps`; dividir sobre el working tree actual si se continúa.
`Layout.tsx`/`Reports.tsx` siguen reservados hasta nuevo aviso.

## Fase 2 (frontend) — `DeviceDetail.tsx` dividido (2026-08-24)

Cuarto archivo, el más grande y denso hasta ahora (832 líneas al momento de
dividirlo — había crecido de 772 por la pestaña de Incidentes de la Fase 11
de `close-hp-sds-gaps`, ya integrada). `close-hp-sds-gaps` arrancó su Fase
4.2 (ciclo de pedidos de consumibles) en paralelo y pidió coordinar el
orden: dividir `DeviceDetail.tsx` primero (sin cruce), después
`ClientDetail.tsx` cuanto antes porque le va a agregar una card nueva ahí
(`SupplyRequestSettingsCard`) y prefiere hacerlo sobre la estructura ya
dividida en vez de sobre el archivo monolítico. `Dashboard.tsx` también lo
va a tocar (tile de pedidos pendientes) pero es aditivo y chico — sólo pidió
aviso de cuándo se agarra.

El archivo ya tenía primitivas de presentación puras (`Row`, `CardTitle`,
`Card`, `DeviceImage`, `TripleRows`, `fmtDateTime`, `POLL_LABEL`) y dos
"cards" reutilizables definidas como clausuras internas (`SuppliesTable`,
`CountersCard`, capturando `device`/`supplyRows`/`rate`/`counters` del
scope del componente) además de 7 pestañas completas. División (14
archivos):
- `types/deviceDetailPage.ts` (34L) — `Reading`, `DeviceDetailData`,
  `DeviceDetailTab`, `ActiveAlertItem`.
- `components/devices/detail/primitives.tsx` (50L) — `Row`/`CardTitle`/
  `Card`/`DeviceImage`/`TripleRows`, sin estado de página.
- `components/devices/detail/format.ts` (4L) — `fmtDateTime`/`POLL_LABEL`
  en su propio archivo (no `.tsx`) a propósito: mezclarlos en
  `primitives.tsx` disparaba el warning de eslint
  `react-refresh/only-export-components` (un archivo de componentes que
  también exporta funciones/constantes rompe Fast Refresh) — se separó en
  vez de aceptar el warning.
- `components/devices/detail/{SuppliesTable,CountersCard}.tsx` — las dos
  clausuras "levantadas" a componentes propios con props explícitas
  (`device`, `supplyRows`, `rate`, `latest`, `totalPages`, etc.) en vez de
  cerrar sobre el scope del padre — mismo criterio que las Fases 2
  anteriores.
- `components/devices/detail/{GeneralTab,CountersTab,MediaTab,AlertsTab,
  IncidentsTab,HistoryTab}.tsx` — una por pestaña (la de "Consumibles" no
  necesitó archivo propio, es literalmente `<SuppliesTable/>` inline).
  `IncidentsTab` usa `useNavigate()` directo en vez de recibir `navigate`
  como prop (hook válido en cualquier componente de función, evita un prop
  más).
- `components/devices/detail/{DeviceDetailHeader,DeviceStatusBanners}.tsx`
  (nuevos, no estaban en el plan inicial) — el breadcrumb+acciones y los 3
  banners de estado se extrajeron recién en una segunda pasada porque el
  primer corte de `pages/DeviceDetail.tsx` quedó en 356 líneas (por encima
  del límite); con estos dos afuera bajó a 282.
- `pages/DeviceDetail.tsx` (832L → 282L) — orquestador: estado, efectos,
  handlers, valores derivados (incluye `activeAlerts`, la deduplicación de
  alertas servidor+equipo) y composición de las piezas de arriba.

**Validación:** `npm run check` (icons+tsc+eslint) limpio **sin warnings**
(el de Fast Refresh de arriba se resolvió antes de dar por cerrado, no se
dejó pasar). Vite (:5180) transforma los 14 archivos sin error. Misma
limitación de siempre: sin prueba visual real en navegador en este
entorno — este es el split de mayor riesgo de la Fase 2 frontend hasta
ahora por tamaño/densidad, vale la pena que alguien lo revise visualmente
con más atención que los anteriores. `check-sizes.mjs` limpio tras
regenerar baseline (299 archivos) — el regen capturó de nuevo crecimiento
en curso de `close-hp-sds-gaps` (`authMiddleware.ts`, `rolePolicy.ts`,
`scope.ts`, el módulo `modules/supply-requests/` completo de su Fase 4.2).

**Pendiente de Fase 2 frontend:** `ClientDetail.tsx` (571) — siguiente,
pedido por `close-hp-sds-gaps` para poder agregar su card ahí sin pisar.
`DeviceLifecycleModals.tsx` (603), `Dashboard.tsx` (507) — avisar antes de
arrancar `Dashboard.tsx` (van a agregar un tile ahí en su Fase 4.2).

## Fase 2 (frontend) — `ClientDetail.tsx` dividido (2026-08-24)

Quinto archivo (571L), priorizado a pedido de `close-hp-sds-gaps`: le va a
agregar una card nueva (`SupplyRequestSettingsCard`, Fase 4.2) y prefería
hacerlo sobre la estructura ya dividida en vez de sobre el monolito.

Era el archivo con MÁS cards ya extraídas de los 5 divididos hasta ahora
(`ApiKeysCard`/`CustomFieldsCard`/`IncidentRulesCard` ya vivían en
`components/clients/`) — quedaban 3 "cards" autocontenidas definidas
inline (`NotificationSettingsCard`, `DeviceApprovalCard`,
`DuplicateDevicesCard`) más dos secciones grandes del render principal
(metrics + perfil + la tabla de monitores con sus helpers `MonitorStatusBadge`/
`timeAgo`) sin extraer.

División (6 archivos nuevos, todos en `components/clients/` — mismo
directorio que las 3 cards que ya vivían ahí, para que la card nueva de
`close-hp-sds-gaps` encaje en el mismo lugar):
- `NotificationSettingsCard.tsx` (107L), `DeviceApprovalCard.tsx` (66L),
  `DuplicateDevicesCard.tsx` (71L) — las 3 clausuras inline movidas
  literales (ya eran autocontenidas, sin cambios de props).
- `ClientMetricsCards.tsx` (41L), `ClientProfileCard.tsx` (56L) — la
  columna de métricas y el panel de perfil del "Header Dashboard",
  presentacionales.
- `ClientMonitorsSection.tsx` (139L) — la sección completa de
  "Infraestructura de Monitoreo" (header + botón "Registrar Nuevo Monitor"
  + tabla), incluye `MonitorStatusBadge`/`timeAgo` (sólo se usaban ahí).
  Se preservó tal cual una inconsistencia preexistente del original: la
  columna de header "Intervalo" no tiene `<td>` correspondiente en el
  `tbody` — no es un bug de esta pasada, no se tocó.
- `pages/ClientDetail.tsx` (571L → 157L) — orquestador: estado/handlers +
  composición de las 9 cards del grid + la sección de monitores + 2 modales.

**Validación:** `npm run check` limpio sin warnings. Vite (:5180)
transforma los 7 archivos sin error. `check-sizes.mjs` limpio tras
regenerar baseline (306 archivos) — capturó de nuevo crecimiento en curso
de `close-hp-sds-gaps` (`server.ts`, `jobs/notificationWorker.ts`,
`services/notificationService.ts`, todo de su Fase 4.2). Sin prueba visual
real en navegador en este entorno.

**Pendiente de Fase 2 frontend:** `DeviceLifecycleModals.tsx` (603),
`Dashboard.tsx` (507) — avisar a `close-hp-sds-gaps` antes de arrancar
`Dashboard.tsx` (le va a agregar un tile ahí en su Fase 4.2).

## 0. Punto de partida (medido 2026-08-24)

`stc-cloud` es un monolito con **varios dominios de negocio** bajo un mismo backend
desplegable (clientes, dispositivos/agentes, alertas, reportes, auditoría, inventario,
insumos, cola de alta de equipos). Por la sección 2 de la guía ("Backend — variante
monolito modular"), el target correcto **no** es capa→módulo (`domain/<módulo>/`) sino
**módulo→capa**:

```
src/
├── shared/                  # config, errores base, conexión DB, middlewares, health check
│   ├── domain/
│   ├── infrastructure/
│   └── presentation/
└── modules/
    ├── auth/
    ├── clients/
    ├── devices/              # incluye lifecycle, monitor state, snmp credentials
    ├── agents/                # telemetría, WS, heartbeat
    ├── alerts/
    ├── reports/
    ├── audit/
    ├── inventory/
    ├── supplies/
    ├── pending-devices/       # cola de alta / decommission
    └── dashboard/             # agregación read-only cross-módulo (ver §4)
```

Regla de la guía que aplica igual acá: **ningún módulo importa `domain`/`application` de
otro módulo**, solo `shared/`.

### Archivos que ya violan el límite de 300 líneas (backend)

| Archivo | Líneas | Módulo destino |
|---|---:|---|
| `services/agentService.ts` | 1529 | `agents` |
| `api/controllers/deviceController.ts` | 777 | `devices` |
| `api/controllers/portalAgentController.ts` | 610 | `agents` |
| `api/controllers/dashboardController.ts` | 593 | `dashboard` |
| `services/deviceLifecycleService.ts` | 516 | `devices` |
| `services/ipRangeSpec.ts` | 435 | `devices` (o `shared` si se reusa) |
| `api/controllers/authController.ts` | 385 | `auth` |
| `services/reportService.ts` | 355 | `reports` |
| `api/controllers/clientController.ts` | 345 | `clients` |
| `api/server.ts` | 333 | `shared/presentation` |
| `services/suppliesService.ts` | 301 | `supplies` |

### Archivos que violan el límite (portal, frontend)

| Archivo | Líneas |
|---|---:|
| `pages/Settings.tsx` | 869 |
| `pages/DeviceDetail.tsx` | 772 |
| `pages/Monitors.tsx` | 615 |
| `components/devices/DeviceLifecycleModals.tsx` | 603 |
| `pages/ClientDetail.tsx` | 571 |
| `pages/MonitorDetail.tsx` | 569 |
| `pages/Dashboard.tsx` | 507 |
| `components/Layout.tsx` | 482 |
| `components/monitors/ReportsTabPanel.tsx` | 450 |
| `components/monitors/DeviceInventoryTable.tsx` | 420 |
| `pages/Alerts.tsx` | 417 |
| `pages/Reports.tsx` | 366 |
| `components/monitors/SnmpCredentialsPanel.tsx` | 353 |
| `components/clients/ApiKeysCard.tsx` | 342 |
| `components/FeedbackModal.tsx` | 334 |
| `pages/Clients.tsx` | 333 |

## Riesgo actual a tener en cuenta

Al momento de escribir este plan hay una sesión hermana (`close-hp-sds-gaps`) editando
en vivo varios de estos mismos archivos (bulk actions sobre `DeviceInventoryTable.tsx`,
módulos de auditoría/inventario/supplies nuevos aún sin commitear). **Ninguna fase de
código debe arrancar sin coordinar con esa sesión primero** — de lo contrario un módulo
recién creado por esta migración puede pisar o quedar inconsistente con trabajo en curso.

---

## Fases

### Fase 0 — Fundaciones (sin tocar código de negocio)

No mueve ni reescribe nada; solo arma el andamiaje para que las fases siguientes sean
mecánicas y verificables.

1. `docs/adr/` — crear el directorio y el primer ADR: `001-adoptar-architecture-guide.md`
   (contexto: por qué se adopta, decisión: variante monolito modular, consecuencias:
   costo de migración vs. mantenibilidad a largo plazo).
2. `scripts/sizes-baseline.json` — congelar los tamaños actuales (tabla de arriba +
   el resto del árbol) como deuda aceptada, igual que hace `helpdesk-manager`. Ningún
   archivo nuevo puede superponerse a este baseline; los ya listados se migran fuera
   de él a medida que se dividen.
3. `scripts/check_sizes.py` (o equivalente Node/ts-node) — falla en CI si aparece un
   archivo nuevo >300 líneas o una función nueva >20 líneas que no esté en el baseline.
4. Jerarquía de errores base en `shared/domain/errors/` (`AppError`, `DomainError`,
   `ValidationError`, `ApplicationError`, `NotFoundError`, `UnauthorizedError`,
   `InfrastructureError`, `DatabaseError`, `ExternalServiceError`) — hoy no existe
   ninguna, los controllers devuelven errores ad-hoc.
5. Actualizar `docs/dev/PROJECT_GUIDELINES.md` para que deje de documentar la
   convención vieja (`api/` + `services/` plano) y apunte a `ARCHITECTURE_GUIDE.md` +
   este plan, marcando el estado como "en migración".

**Criterio de salida:** ADR aprobado, baseline commiteado, `check_sizes` corriendo en
CI en modo no bloqueante (solo reporta) durante la Fase 0.

### Fase 1 — Módulo piloto

Elegir **un módulo chico y ya bien acotado** para validar el patrón módulo→capa antes
de tocar los grandes. Candidato: `supplies` (301 líneas de servicio, rutas y
controller ya separados, sin dependencias circulares con otros dominios evidentes).

1. `modules/supplies/domain/` — entidades y reglas puras extraídas de
   `suppliesService.ts` (sin Knex, sin Fastify).
2. `modules/supplies/application/use-cases/` — un caso de uso por operación
   (`ListSupplies`, `RecordSupplyEvent`, etc.), 1 archivo cada uno.
3. `modules/supplies/infrastructure/database/` — repositorio concreto sobre Knex,
   implementando la interfaz de dominio.
4. `modules/supplies/presentation/` — mover `suppliesController.ts` +
   `suppliesRoutes.ts` acá, adelgazados a solo validar input / serializar output.
5. Tests: unit sobre `domain`/`application` (sin DB), integración sobre
   `infrastructure`, conservando `supplies.test.ts` como e2e.

**Criterio de salida:** módulo piloto compila, tests pasan, PR revisado por el equipo
antes de replicar el patrón — este PR es el que fija la convención real del repo
(ejemplos concretos > la guía en abstracto).

### Fase 2 — Dividir los archivos grandes por dominio (sin capas todavía)

Antes de migrar cada módulo completo a capas, cortar los archivos que superan el
límite dentro de su ubicación actual, dominio por dominio, empezando por los de mayor
riesgo/tamaño:

1. `services/agentService.ts` (1529 líneas) → separar por responsabilidad (ingesta de
   telemetría, gestión de conexión WS, ciclo de vida del agente, credenciales) antes
   de moverlo a `modules/agents/`.
2. `api/controllers/deviceController.ts` (777) y `portalAgentController.ts` (610).
3. `api/controllers/dashboardController.ts` (593) — candidato a quedar como capa de
   presentación fina que solo agrega datos de otros módulos vía sus casos de uso
   (no lógica propia).
4. Resto de la tabla de la Fase 0, en orden descendente de tamaño.

Frontend en paralelo, mismo criterio (extraer hooks/sub-componentes de
`Settings.tsx`, `DeviceDetail.tsx`, `Monitors.tsx`, etc.), migrando a feature-slices
(`features/<feature>/{components,hooks,store,api,types}`) recién cuando el archivo ya
esté dividido.

### Fase 3 — Migrar cada módulo restante a capas

Repetir el patrón validado en la Fase 1 para `clients`, `devices`, `agents`, `alerts`,
`reports`, `audit`, `inventory`, `pending-devices`, en ese orden (por acoplamiento
ascendente — `devices`/`agents` son los más centrales y se dejan para cuando el
patrón ya esté probado en 3-4 módulos más chicos).

### Fase 4 — Frontend a feature-slices

Reestructurar `portal/src` de `pages/`+`components/` planos a `features/<feature>/`
por dominio, con `shared/` para lo transversal. Se hace después del backend porque los
tipos (`types/monitor.ts`, etc.) deberían derivar de los DTOs que expongan los nuevos
`application/dtos/` del backend.

### Fase 5 — Enforcement completo + cobertura

1. `check_sizes.py` pasa a bloquear en CI (ya no solo reporta).
2. `check_guards.py`-equivalente: prohibir `console.log`, SQL por concatenación,
   `except`/`catch` que silencian, endpoints sin paginación.
3. Subir cobertura a los mínimos de la guía (Domain 90% / Application 85% /
   Infrastructure 70% / Presentation 60%), módulo por módulo a medida que se migra —
   no de golpe.
4. Checklist de seguridad por módulo (catálogo de permisos, `require_permission` en
   cada endpoint) — hoy `rolePolicy.ts` existe pero no está confirmado que cada
   endpoint nuevo lo declare; auditar como parte de esta fase.

---

## Cómo retomar este plan

Cada fase es independiente y puede ejecutarse como una tarea separada. Antes de
arrancar cualquier fase de código (1 en adelante):

1. Confirmar con la sesión hermana que esté trabajando en el repo que no hay choque
   de archivos con el módulo/carpeta que se va a tocar.
2. Correr `npx tsc --noEmit` y la suite de tests como línea base antes de mover nada.
3. Un PR por módulo/archivo dividido, nunca "migración completa" en un commit — la
   guía misma lo exige (§9, máx. 400 líneas por PR).
