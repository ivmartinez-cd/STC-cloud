# Plan de Migración a ARCHITECTURE_GUIDE.md

**Estado:** Fase 0, Fase 1 y Fase 2 (backend + frontend) COMPLETAS —
incluidas las 2 pasadas diferidas de alto riesgo del backend
(`syncReadings`, `mergeDevices`) y los 7 archivos grandes del frontend
(`Settings.tsx`, `Monitors.tsx`, `MonitorDetail.tsx`, `DeviceDetail.tsx`,
`ClientDetail.tsx`, `DeviceLifecycleModals.tsx`, `Dashboard.tsx`). Fase 3
(migrar módulos existentes a capas completas) en curso: `audit` e
`inventory` migrados a `modules/` — 2026-08-24  
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

## Fase 2 (frontend) — `DeviceLifecycleModals.tsx` dividido (2026-08-24)

Sexto archivo (603L), sin coordinación pendiente (nadie lo reclamó). A
diferencia de las páginas anteriores, este archivo no es una página sino un
módulo de 8 modales exportados con nombre (`EditDeviceModal`,
`DecommissionDeviceModal`, `MoveDeviceModal`, `BulkDecommissionModal`,
`BulkRecommissionModal`, `BulkMoveDevicesModal`, `BulkMonitorStateModal`,
`MergeDeviceModal`), cada uno ya autocontenido — el mismo patrón
"directorio + `index.ts` barrel" de la Fase 2 backend aplicó
mecánicamente sin cambios:

- `components/devices/DeviceLifecycleModals/` (nuevo directorio,
  reemplaza el `.tsx` suelto) con un archivo por modal +
  `types.ts` (`ClientOption`/`AgentOption`/`BulkActionResult`,
  compartidos entre 3 de los 8) + `index.ts` (barrel, re-exporta los 8
  + los 3 tipos).
- Los 3 consumidores (`pages/DeviceDetail.tsx`,
  `components/monitors/DeviceInventoryTable.tsx`,
  `components/clients/DuplicateDevicesCard.tsx`) usaban imports con
  specifier "pelado" (`from '.../DeviceLifecycleModals'`, sin `/index` ni
  `.tsx`) — resolvieron al directorio nuevo con **cero ediciones**,
  confirmado con `tsc --noEmit` limpio y los 3 archivos transformando en
  Vite sin tocarlos.

**Validación:** `npm run check` limpio sin warnings. `check-sizes.mjs`
limpio tras regenerar baseline (316 archivos) — capturó de nuevo
crecimiento en curso de `close-hp-sds-gaps` (`rbac.test.ts` y el
`tests/supplyRequests.test.ts` nuevo, ambos de su Fase 4.2). Sin prueba
visual real en navegador en este entorno.

**Pendiente de Fase 2 frontend:** sólo `Dashboard.tsx` (507) — avisar a
`close-hp-sds-gaps` antes de arrancar (le va a agregar un tile ahí en su
Fase 4.2).

## Fase 2 (frontend) — `Dashboard.tsx` dividido, Fase 2 COMPLETA (2026-08-24)

Séptimo y último archivo de la cola original de Fase 2 frontend.
`close-hp-sds-gaps` confirmó que seguía libre (todavía no había agregado su
tile de pedidos pendientes) y pidió el mismo esquema que `ClientDetail.tsx`:
dividir primero, agregar su tile después sobre la estructura nueva.

División (7 archivos nuevos en `components/dashboard/`, directorio nuevo):
- `StatCard.tsx` (40L) — presentacional, incluye `STAT_COLOR_VARIANTS`
  (sólo se usaba ahí).
- `BrandDistributionCard.tsx` (51L), `TopClientsCard.tsx` (35L),
  `OfflineAgentsCard.tsx` (45L) — las 3 cards de la fila "Header Dashboard"
  original.
- `AlertsByClassCard.tsx` (50L, incluye `CLASS_COLOR`),
  `AgentVersionsCard.tsx` (41L) — la fila de resumen de alertas +
  versiones de agente.
- `SupplyAlertsTable.tsx` (161L) — la tabla grande de "Consumibles en
  Alerta", autocontenida (tenía su propio fetch/polling de 30s ya en el
  original — `alerts`/`alertsLoading`/`fetchAlerts` — se llevó tal cual,
  incluye `getTonerColorInfo`).
- `pages/Dashboard.tsx` (538L → 171L) — orquestador: `useDashboard()` +
  `openIncidents` (el único estado que queda en la página, porque sólo lo
  usa un tile inline) + composición.

**Decisión deliberada de NO extraer** los 2 tiles condicionales
("equipos pendientes de aprobación" / "incidentes abiertos", cada uno
`{condición && <Link>...</Link>}`) en un componente propio: quedan
inline en `pages/Dashboard.tsx` a propósito, porque es exactamente donde
`close-hp-sds-gaps` va a pegar un tercer bloque idéntico (tile de pedidos
pendientes) — extraerlos habría obligado a rediseñar el punto de
extensión en vez de dejarlo copy-pasteable como ya lo usan los otros dos.

**Validación:** `npm run check` limpio sin warnings. Vite (:5180)
transforma los 8 archivos sin error. `check-sizes.mjs` limpio tras
regenerar baseline (327 archivos) — capturó de nuevo crecimiento en curso
de `close-hp-sds-gaps` (`App.tsx`/`Layout.tsx` nav, `ClientDetail.tsx` +2
líneas por su `SupplyRequestSettingsCard` ya agregada ahí en paralelo,
`components/supplies/SupplyRequestDetailModal.tsx` y
`pages/SupplyRequests.tsx` nuevos — su Fase 4.2 aterrizando en el
frontend). Sin prueba visual real en navegador en este entorno.

**Con esto, la Fase 2 (frontend) queda 100% completa** — los 7 archivos
que estaban por encima de 300 líneas en `portal/src` al congelar la Fase 0
(`Settings.tsx`, `DeviceDetail.tsx`, `Monitors.tsx`,
`DeviceLifecycleModals.tsx`, `ClientDetail.tsx`, `MonitorDetail.tsx`,
`Dashboard.tsx`) están todos divididos, todos bajo el límite de archivo,
sin deuda nueva de archivo (el límite de función sigue aceptado vía
baseline para componentes React con JSX no trivial, documentado en la
sección de `Settings.tsx` arriba). Con Fase 0, Fase 1 y Fase 2
(backend+frontend) cerradas, no queda ningún ítem abierto de este plan —
las fases 3+ (mover módulos ya divididos a la estructura completa
domain/application/infrastructure/presentation de `ARCHITECTURE_GUIDE.md`)
no fueron pedidas todavía y no deberían asumirse como pre-aprobadas.
(Nota: esto quedó obsoleto — Ivan pidió explícitamente arrancar Fase 3
más tarde el mismo día, ver sección "Fase 3" más abajo.)

## Fase 3 — arranca con `audit` (2026-08-24)

Ivan pidió explícitamente seguir después del cierre de Fase 2 y confirmó
arrancar la Fase 3 (migrar módulos existentes a la estructura completa
`domain/application/infrastructure/presentation`, no sólo dividir
archivos), dejando el orden a criterio de esta sesión y pidiendo además
avisarle a `close-hp-sds-gaps` que todo código NUEVO se escriba
directamente con esa estructura de acá en más.

El plan (sección "Fases" más abajo) sugiere empezar por `clients` — pero
`clients`/`devices` son justo los dominios donde `close-hp-sds-gaps` está
desarrollando activamente (Fase 4.2/4.3: `SupplyRequestSettingsCard`,
`notification_events`, plantillas de mensajes). Mismo criterio que ya se
usó para elegir módulo piloto en Fase 1 y archivo por archivo en Fase 2:
**se arranca por el dominio más chico y quieto, no por el que dice el
plan literal.** `audit` (el feed de "Movimientos y cambios") resultó ser
eso: ~300 líneas repartidas en 4 archivos (`auditController.ts`,
`auditRoutes.ts`, `auditService.ts`, `auditCatalog.ts`), sin ninguna
modificación pendiente de nadie. Confirmado con `close-hp-sds-gaps` antes
de tocar nada.

**Aviso a `close-hp-sds-gaps` (cumplido):** ya venían escribiendo
`modules/scheduled-reports/`, `modules/supply-requests/` y
`modules/message-templates/` con la estructura completa de capas por su
cuenta — el pedido de Ivan fue más confirmación que instrucción nueva.

**Decisión importante: `services/auditService.ts` (la función
`writeAudit`) NO se migró ni se tocó.** Tiene ~9 call-sites en otros
módulos (`deviceController`, `deviceLifecycleService`, etc.) que escriben
a `audit_logs` — es infraestructura compartida transversal, no parte del
dominio `audit` en sí (que es sólo el LADO DE LECTURA: el feed y el
catálogo de acciones). Migrarlo hubiera significado tocar ~9 archivos
ajenos sin necesidad. Mismo criterio ya usado por `close-hp-sds-gaps` en
`modules/feedback/`: cuando un módulo necesita escribir a `audit_logs`,
define su propio puerto (`AuditLogWriter`) + adapter Knex propio, en vez
de depender de un "dueño" central de la tabla — no hay una razón para que
`audit` sea distinto.

División (`modules/audit/`, 10 archivos, ~505 líneas):
- `domain/entities/audit-log.ts` — `AuditLogEntry`, `AuditActionSummary`,
  `AuditTargetKind`.
- `domain/services/audit-action-catalog.ts` — `auditCatalog.ts` movido
  literal (puro, sin Knex/Fastify, ya lo era).
- `domain/repositories/audit-log-repository.ts` — interfaz
  `AuditLogRepository` (`findPage`, `countActionsSince`) + tipos de
  filtro/fila cruda.
- `application/dtos/audit-dtos.ts`, `application/use-cases/{list-audit-logs,
  list-audit-actions}.ts` — la resolución de filtros (rango de fechas,
  CSV de `action`, CSV de `category` vía catálogo) que antes vivía en el
  controller pasa a los casos de uso. **Detalle preservado a propósito:**
  el filtro por `action` y el filtro por `category` se aplican como DOS
  `whereIn` independientes sobre la misma columna (AND implícito), no como
  una intersección precalculada en JS — mismo comportamiento SQL exacto
  que el controller original, documentado en el tipo `AuditLogFilter`. El
  cache de 60s de `GET /audit-logs/actions` pasa de variable de módulo a
  campo de instancia de `ListAuditActionsUseCase` — equivalente porque el
  caso de uso se instancia una sola vez por proceso (en
  `registerAuditRoutes`, al arrancar el server), no por request.
- `infrastructure/database/knex-audit-log-repository.ts` — la query con
  joins condicionales por regex de uuid (`UUID_RX`) movida literal.
- `presentation/{audit-controller,audit-routes,audit-view}.ts` —
  `audit-view.ts` traduce domain (camelCase) → wire (snake_case) igual
  que `feedback-view.ts`; `audit-routes.ts` conserva la firma exacta
  `registerAuditRoutes(fastify, db, portalAuth)`.

`api/server.ts` — una sola línea tocada (el import de
`registerAuditRoutes`, ahora apunta a `modules/audit/presentation/
audit-routes`), misma línea de registro sin cambios. Borrados:
`api/controllers/auditController.ts`, `api/routes/auditRoutes.ts`,
`services/auditCatalog.ts` (confirmado sin otros consumidores antes de
borrar).

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado
(Postgres/Redis/API propios, puerto 3024): suite completa de backend (24
archivos ahora, la cola de tests creció bastante desde la última corrida)
— **0 fallas en `auditFeed.test.ts` (13/13)**, incluyendo los filtros que
ejercitan el detalle de los dos `whereIn` independientes, RBAC
deny-by-default, y el ciclo escritura→lectura vía el `writeAudit` sin
tocar. Una falla ajena detectada en `messageTemplates.test.ts` (`PUT
/clients/:id` con `notification_events` → 400 en vez de 200) — no
relacionada con este cambio (no toca `clientController`/`clientRoutes`
para nada), es trabajo en curso de `close-hp-sds-gaps` en su Fase
4.3, no se intentó arreglar. `cloud/portal` → `npm run check` limpio
(cambio puramente backend). `check-sizes.mjs` limpio tras regenerar
baseline (341 archivos) — capturó de nuevo crecimiento en curso de
`close-hp-sds-gaps` (`rbac.test.ts`, `ClientDetail.tsx`, `Settings.tsx`,
`messageTemplates.test.ts`, `NotificationEventsCard.tsx`,
`MessageTemplatesCard.tsx`, todo de su Fase 4.3).

**Siguiente candidato para Fase 3:** a evaluar con el mismo criterio
(chico, quieto) contra el estado de `git status`/`close-hp-sds-gaps` en
el momento — no asumir que el orden `clients, devices, agents, alerts,
reports, audit, inventory, pending-devices` sugerido más abajo en este
documento sigue vigente tal cual (además tiene una inconsistencia interna:
pone `devices`/`agents` en 2º/3º lugar pese a decir que deberían dejarse
para el final).

## Fase 3 — `inventory` migrado (2026-08-24)

Segundo módulo. `clients`/`devices`/`agents`/`alerts`/`reports` seguían
(y siguen) activos por `close-hp-sds-gaps` (Fase 4.3 cerrando, Fase 4.4
"auditoría de correo" arrancando — pidieron explícitamente no tocar
`notificationService.ts`/`notificationWorker.ts`/`reportDeliveryWorker.ts`/
`clientRoutes.ts`/`clientController.ts`/`server.ts` hasta nuevo aviso).
`inventory` (campos personalizados + catálogo de modelos de equipo, Fase 4
del gap analysis) seguía quieto: ~390 líneas en 3 archivos
(`inventoryController.ts`, `inventoryRoutes.ts`, `customFieldService.ts`).

**Dos sub-dominios bajo un mismo módulo** (`inventory` ya los agrupaba en
un solo controller/rutas en el código original, no se inventó una
separación nueva): definiciones de campos personalizados por cliente
(con reglas de negocio reales: formato de `key`, límite de 25 campos
vivos por alcance, validación de `options` para type=select) y catálogo
global de modelos de equipo (CRUD directo sobre `device_models`, sin
reglas de negocio más allá de unicidad brand/model_key).

**Mismo criterio que con `writeAudit` en la pasada de `audit`, pero con
una conclusión DISTINTA esta vez:** `customFieldService.ts` también tenía
un consumidor externo (`deviceController/crud.ts`, vía
`validateAndMerge`) — pero a diferencia de `writeAudit` (infraestructura
transversal sin lógica de negocio propia), `validateAndMerge` SÍ es lógica
de negocio central de `inventory` (las reglas de tipos/validación de
`custom_data`). Se migró igual, y `deviceController/crud.ts` (quieto,
confirmado con `git status`) pasa a importar el facade
`modules/inventory/index.ts::validateAndMerge` — misma firma exacta que
la función vieja, cero cambios en el call-site más allá del import.

División (`modules/inventory/`, 15 archivos, ~830 líneas):
- `domain/entities/{custom-field-def,device-model}.ts`.
- `domain/errors/custom-field-error.ts` — `CustomFieldError` (con
  `statusCode`, tal cual el original, no se "arregló" a
  `shared/domain/errors`).
- `domain/services/custom-field-rules.ts` — las reglas puras
  (`KEY_RX`/`VALID_TYPES`/`MAX_LIVE_FIELDS_PER_SCOPE`, validación de
  key/label/options, `mergeCustomFieldData` — el switch de coerción por
  tipo que antes vivía en `validateAndMerge`).
- `domain/repositories/{custom-field-def,device-model}-repository.ts`.
- `application/dtos/inventory-dtos.ts` +
  `application/use-cases/{custom-field-def,device-model}-use-cases.ts`
  (varios casos de uso chicos agrupados por agregado en un mismo archivo,
  no uno por archivo como en `feedback`/`audit` — siguen bajo el límite
  de líneas con margen de sobra, evita 8 archivos casi vacíos).
- `infrastructure/database/knex-{custom-field-def,device-model}-repository.ts`.
- `presentation/{inventory-controller,inventory-routes,inventory-view}.ts`
  — `inventory-routes.ts` conserva los JSON schemas de Fastify literales
  (único módulo migrado hasta ahora que los tenía).
- `index.ts` — facade `validateAndMerge(db, clientId, currentData, patch)`
  + re-export de `CustomFieldError`, para `deviceController/crud.ts`.

**Detalle preservado a propósito:** `createCustomField` y
`createDeviceModel` conservan el chequeo de "campos requeridos" en el
controller/use-case ANTES de tocar las reglas de dominio más finas (ej.
`key` vacío da un mensaje distinto — "key, label y type son requeridos"
— al de una `key` presente pero con formato inválido). No se colapsó en
una sola validación de dominio: cambiar el orden/mensaje de error hubiera
sido un cambio de comportamiento observable, no sólo estructural.

`api/server.ts` — una línea (import de `registerInventoryRoutes`).
Borrados `api/controllers/inventoryController.ts`,
`api/routes/inventoryRoutes.ts`, `services/customFieldService.ts`
(confirmado sin otros consumidores fuera de `deviceController/crud.ts`,
ya migrado).

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado
(puerto 3025) — **`inventoryFields.test.ts` 15/15 verde**, incluye
override de `asset_number`/`asset_tag`/`duty_cycle_monthly`, creación de
campo `select`, valor fuera de opciones → 400, key desconocida → 400,
merge sin pisar otros campos, archivado, `duty_cycle_effective` leyendo
del catálogo de `device_models`, y RBAC (client_viewer sólo lectura). 3
fallas ajenas (una en `rbac.test.ts` sobre `/email-log`, dos suites
completas en `messageTemplates.test.ts`/`emailLog.test.ts`) — todas del
trabajo en curso de `close-hp-sds-gaps` (Fase 4.3/4.4, `messageTemplates`
confirmado por ellos mismos como artefacto de imagen desactualizada en
este entorno efímero, `emailLog` es un módulo nuevo suyo con rutas
todavía devolviendo 404). `cloud/portal` → `npm run check` limpio (cambio
puramente backend). `check-sizes.mjs` limpio tras regenerar baseline (358
archivos) — capturó de nuevo crecimiento en curso de `close-hp-sds-gaps`.

**Nota operativa de esta pasada:** el primer intento de arrancar el
servidor efímero con `nohup node ... &` en el mismo bloque que el health
check subsiguiente se colgó (probablemente el proceso murió al mover el
bloque a background por el timeout de 120s del harness, pese al
`nohup`). Se resolvió arrancando el servidor con la opción
`run_in_background` dedicada del tool de Bash en su propia llamada,
separada de la verificación de salud — más robusto que
`nohup ... & echo $! > pidfile` en este entorno. Usar ese patrón de acá
en más para levantar el server efímero.

**Siguiente candidato para Fase 3:** seguir evitando `clients`/`devices`/
`agents`/`alerts`/`reports` hasta que `close-hp-sds-gaps` avise que cerró
4.3/4.4. Dominios que podrían seguir quietos: `pending-devices` (pero no
tiene un service dedicado, está repartido entre varios archivos de
`agentService`/`deviceController` — evaluar si vale la pena como módulo
propio o si conviene esperar). Re-chequear `git status`/coordinar de
nuevo antes de elegir.

## Fase 3 — `alerts` migrado (2026-08-24)

Tercer módulo. Ivan pidió "terminar con la Fase 3"; `close-hp-sds-gaps`
confirmó por mensaje que ya había cerrado sus Fases 4.x/5/6/7 (2FA, agente
v1.2.0, remote-actions) y que no tenía planeado tocar `alerts`/`reports`/
`clients` — se preguntó ANTES de tocar nada y se esperó la respuesta (regla
nueva de Ivan, mismo día: "no se pisen entre agentes — pregunten, esperen y
luego hagan"; aplica también a lo pesado de CPU: la suite de backend se
lanzó recién con el OK explícito de las 3 sesiones activas).

`alerts` estaba repartido en 5 archivos (~800 líneas): `services/alertService.ts`
(las primitivas de escritura `openAlert`/`resolveAlert`/`resolveStaleDeviceAlerts`
+ `synthesizeEwsAlertType`), `services/alertCatalog.ts` (clasificación pura +
`backfillAlertClassification` con Knex), y tres archivos del
`dashboardController/` (`alerts-reads.ts`, `alerts-mutations.ts`, `shared.ts`
con el `buildScopedAlertQuery` compartido con el dashboard).

División (`modules/alerts/`, 24 archivos, ~1.100 líneas):
- `domain/entities/alert.ts` — `AlertClass`/`Responder`/`AlertSeverity`/
  `AlertOrigin`, labels, `AlertListItem` (camelCase), `AlertLifecycleState`,
  `AlertSummary`.
- `domain/services/{alert-catalog,ews-alert-type,alert-rules}.ts` —
  `classifyAlert` (movido literal, sigue siendo puro), el hash de tipo EWS, y
  las reglas que antes vivían inline en `openAlert`/`updateAlert`:
  `deviceAcceptsAlerts` (gate por `monitor_state`/`registration_state`),
  `buildLifecycleUpdates` (whitelist ack/resolve), `lifecycleAuditAction`,
  `parseCsvOrThrow`.
- `domain/errors/alert-error.ts` — `AlertError` con `statusCode` (400/404),
  mismo criterio que `CustomFieldError`.
- `domain/repositories/alert-repository.ts` — interfaz + `AlertScope`
  (estructuralmente idéntico a `api/utils/scope.ts::Scope`, duplicado a
  propósito para que el dominio no importe de la capa HTTP).
- `application/ports/{audit-log-writer,notification-enqueuer,alert-unit-of-work}.ts`
  — el encolado de `alert.created` pasa a ser un puerto (el adapter BullMQ es
  quien absorbe y loguea el error: "best-effort" es contrato del puerto, no
  un try/catch del caso de uso); la unidad de trabajo existe SÓLO para la
  acción en bloque, que era la única mutación transaccional (update + audit
  en la misma trx).
- `application/use-cases/{open-alert,resolve-alerts,list-alerts,
  get-alert-summary,update-alert,bulk-update-alerts}.ts`.
- `infrastructure/database/{knex-alert-repository,knex-alert-unit-of-work,
  knex-audit-log-writer,backfill-alert-classification}.ts` +
  `infrastructure/queue/bullmq-notification-enqueuer.ts`. El writer de audit
  delega en `services/auditService.writeAudit` (infra transversal, no se
  migra — decisión de la pasada de `audit`).
- `presentation/{alert-controller,alert-routes,alert-view}.ts` —
  `registerAlertRoutes(fastify, db, portalAuth)`, JSON schemas literales
  conservados, `alert-view.ts` traduce camelCase → snake_case del wire.
- `index.ts` — fachada con las MISMAS firmas que `services/alertService.ts`
  (`openAlert(db, params)` etc.) para `jobs/alertWorker.ts`,
  `jobs/heartbeatMonitor.ts` y `services/agentService/sync-reading-alerts.ts`:
  esos 3 call-sites sólo cambiaron el path del import. Más
  `countOpenAlertsByClass(db, scope)` para el desglose del dashboard.

**Detalles preservados a propósito:**
- Orden de validaciones distinto en single vs bulk (`PUT /alerts/:id`: 404 por
  no-propiedad ANTES del 400 por body vacío; `POST /alerts/bulk`: ids → body
  vacío → propiedad). Cambiar el orden hubiera sido un cambio observable.
- El chequeo de propiedad de las mutaciones NO excluye lápidas de fusión
  (`merged_into`) mientras que el listado/resumen sí — así lo hacía el
  controller original (`ownershipQuery` vs `scopedQuery` en el repositorio).
- Un equipo inexistente no bloquea `openAlert` (el gate sólo corta si la fila
  existe y está `disabled`/`reports_only` o no `registered`).
- `alerts.type` se recorta a 50 ANTES de clasificar (`toNewAlert`), igual que
  antes.

`dashboardController/` queda sólo con el dashboard: `index.ts` y
`dashboardRoutes.ts` pierden las rutas/handlers de alertas; `dashboard.ts`
consume `countOpenAlertsByClass` del módulo; `dashboard-queries.ts` pierde
`queryAlertsByClassRows`. `api/server.ts` — una línea nueva
(`registerAlertRoutes`), la de `registerDashboardRoutes` sin cambios.
`incidentClassifier.ts` (tipo `AlertClass`), la migración
`20260824010000` (`backfillAlertClassification`) y `alertCatalog.test.ts`
apuntan al módulo. Borrados los 5 archivos originales.

**Nota operativa (entorno efímero):** `knexfile.ts` NO lee `DB_PORT` (sólo
host/user/password/database) y con `DATABASE_URL` fuerza SSL (que un
Postgres de contenedor no tiene). Para apuntar la API a un Postgres en otro
puerto: `PGPORT=<puerto>` (node-postgres lo honra por entorno) + `DB_HOST`,
sin `DATABASE_URL`. Y `alerts.test.ts` accede directo a la base con
`ALERTS_TEST_DB_PORT`. Además, el init de `timescale/timescaledb` aborta si
la máquina está saturada (su reinicio interno excede el timeout) y deja el
contenedor en recuperación eterna — recrearlo, no esperar.

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado
(contenedores `stc_f3_pg`/`stc_f3_redis`, API en :3026 — regla nueva: se
pidió y esperó el OK de las 3 sesiones activas antes de lanzarlo). Suite
completa de backend (29 archivos, `scripts/ci-test-runner.mjs`):
**`alerts.test.ts` 32/32, `alertCatalog.test.ts` 31/31, `rbac.test.ts`
87/87, `e2e.test.ts` 37/37** (tras `knex seed:run` — la primera corrida dio
22 fallas por base sin semilla, no por el módulo), `monitorState.test.ts`
11/11 tras actualizar su guard estático (el test que asegura que NADIE
inserta en `alerts` fuera de la primitiva única — antes apuntaba por nombre
a `services/alertService.ts`, ahora a
`modules/alerts/infrastructure/database/knex-alert-repository.ts`; el
invariante sigue siendo el mismo). Los otros 23 archivos verdes salvo 2
fallas ajenas y de entorno: `observability.test.ts` (1 falla, un test
DISTINTO en cada corrida — "dos réplicas" primero, "pub/sub WS" después —
flakiness bajo carga, no toca alertas) y `twoFactor.test.ts` 6.3 (429 del
rate-limit de login con el `RATE_LIMIT_MAX` del `.env`, módulo de
`close-hp-sds-gaps`, avisado). `check-sizes.mjs` limpio tras regenerar
baseline.

## Fase 3 — `reports` migrado (2026-08-24)

Cuarto módulo. OK explícito de `close-hp-sds-gaps` antes de tocar (estaban en
`agent/` y `portal/`, nada de `cloud/src`). `reports` era el cierre mensual
de facturación: `services/reportService/{period-usage,closure,index}.ts`
(consulta LAG-based + cierre/reapertura con trx + encolado de entrega),
`services/reportExportService.ts` (CSV/XLSX), `api/controllers/reportController.ts`
y `api/routes/reportRoutes.ts` — ~660 líneas en 6 archivos.

División (`modules/reports/`, 25 archivos, ~1.000 líneas):
- `domain/entities/{report-closure,period-usage-line}.ts` — `ReportClosure`/
  `ReportClosureLine` en camelCase. **`PeriodUsageLine` se queda en snake_case
  a propósito**: no es un agregado, es el read model de la consulta de
  volumen, y es a la vez la forma de wire del preview y lo que consume el
  renderer de `modules/scheduled-reports` (módulo del hermano — no se lo tocó
  más allá del path del import).
- `domain/services/period.ts` (`parsePeriod` ahora lanza `InvalidPeriodError`
  400 tipado en vez de `Error` pelado — mismo mensaje; `formatPeriod`;
  `sumUsageTotals`) y `domain/services/closure-csv.ts` (el CSV es puro:
  columnas, filas, encabezado de dos líneas, BOM UTF-8 + `;` + CRLF).
- `domain/errors/report-error.ts` — `ReportError` con `statusCode`:
  `InvalidPeriodError` 400, `ClosurePeriodConflictError` 409,
  `ClosureNotFoundError` 404, `ClosureNotReopenableError` 400.
- `domain/repositories/{report-closure-repository,period-usage-query}.ts`.
- `application/ports/{audit-log-writer,report-delivery-enqueuer,report-unit-of-work}.ts`
  — la unidad de trabajo expone `closures` + `usage` + `audit` sobre la MISMA
  transacción (el cierre calcula el volumen adentro de la trx y persiste
  exactamente eso); el encolado de `report.closed` es un puerto best-effort
  que se invoca DESPUÉS del commit (si se encolara adentro, el worker podría
  leer `report_closures` antes de que el commit sea visible).
- `application/use-cases/{preview-period,close-period,reopen-period,
  list-closures,get-closure,export-closure}.ts`. `ExportClosureUseCase`
  devuelve `{filename, contentType, body}` — el controller sólo setea headers.
- `infrastructure/database/{knex-report-closure-repository,knex-period-usage-query,
  knex-audit-log-writer,knex-report-unit-of-work}.ts` (la consulta SQL cruda
  de 80 líneas movida literal a una constante), `infrastructure/export/
  closure-xlsx-renderer.ts` (exceljs) y `infrastructure/queue/
  bullmq-report-delivery-enqueuer.ts`.
- `presentation/{report-controller,report-routes,report-view}.ts`.
- `index.ts` — fachada con las firmas viejas para `jobs/reportDeliveryWorker.ts`
  (`buildClosureCsv`/`buildClosureXlsx`/`formatPeriod`, con filas crudas de la
  base — por eso `ExportLine`/`ExportClosure` siguen en snake_case) y para el
  renderer de `scheduled-reports` (`computePeriodUsage`/`parsePeriod`/
  `formatPeriod`).

**Detalles preservados a propósito:**
- `preview` y `close` respondían 400 con el mensaje ante CUALQUIER error (no
  sólo de dominio) — se conserva (`replying400` en el controller); `reopen`/
  `get`/`export` sólo traducen `ReportError`, el resto sigue siendo 500.
- Orden de chequeos de `reopen`: 404 por no-propiedad, luego 400 si no está
  `closed`. La única diferencia estructural: el chequeo de propiedad pasó a
  correr DENTRO de la misma transacción que el update + audit (antes era una
  lectura previa sin trx) — estrictamente más seguro, mismo resultado.
- `listClosures` devuelve exactamente las 13 columnas del select original;
  `getClosure` devuelve el cierre + `lines` con TODAS las columnas de
  `report_closure_lines` (el `select *` original) — `toClosureLineView` las
  enumera una por una, por eso supera las 20 líneas (deuda aceptada en
  baseline: es un literal de mapeo, no lógica).

`api/server.ts` — una línea (import de `registerReportRoutes`). Borrados los 6
archivos originales (confirmado sin otros consumidores).

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado (misma
receta que `alerts`, OK previo de las 3 sesiones activas), semilla antes de
la suite. Suite completa de backend (29 archivos): **`reports.test.ts`
15/15** (preview, cierre, conflicto 409, reapertura + `superseded_by`,
export), **`scheduledReports.test.ts` 17/17** (el renderer del módulo del
hermano consumiendo `computePeriodUsage` vía la fachada), `e2e.test.ts`
37/37, `rbac.test.ts` 87/87, `publicApi.test.ts` 24/24; los únicos 2 fallos
son los mismos ajenos y de entorno ya documentados en la pasada de `alerts`
(`observability` pub/sub WS flaky, `twoFactor` 6.3 → 429). `check-sizes.mjs`
limpio tras regenerar baseline.

## Fase 3 — `clients` migrado (2026-08-24)

Quinto módulo. OK explícito de `close-hp-sds-gaps` (confirmaron por `git log`
que no tocaron `clientController/*`, `clientRoutes.ts`, `apiKeyService.ts` ni
`publicWebhookService.ts` en esta ronda). Origen: `api/controllers/clientController/
{crud,reads,api-keys,webhook,pending-devices,index}.ts` + `api/routes/clientRoutes.ts`
(~580 líneas).

**Decisión de alcance — tres servicios se quedan en `services/` a propósito:**
`apiKeyService.ts` (lo consume `authMiddleware` para resolver `X-Api-Key`),
`publicWebhookService.ts` (lo consumen `/api/v1/public/webhook` y 3 workers que
disparan webhooks) y `deviceRegistrationService.ts` (dominio `pending-devices`,
todavía repartido entre `agentService`/`deviceController`). Son infraestructura
compartida o dominio de OTRO módulo — migrarlos acá hubiera tocado 6 archivos
ajenos y cruzado dominios. El módulo `clients` los usa a través de puertos
(`ApiKeyStore`, `WebhookConfigStore`, `DeviceRegistrationGateway`) con adapters
finos en `infrastructure/adapters/` — mismo criterio que `writeAudit`. Las
rutas `/clients/:id/pending-devices*` quedan como presentación de `clients`
delegando en el gateway; cuando exista `modules/pending-devices`, el puerto se
implementa con su fachada y las rutas pueden mudarse sin tocar el resto.

**Read models en snake_case a propósito (`ClientRecord`, `ClientDeviceRow`,
`ClientMonitorRow`):** `clients.*` y `devices.*` son tablas ANCHAS que otros
módulos extienden con columnas propias (`notification_events`,
`supply_requests_enabled`, `supply_request_threshold_pct`, `custom_data`...) y
el portal consume las filas tal cual — enumerar columnas en camelCase haría que
cada columna nueva de otro módulo desapareciera del wire en silencio. Mismo
criterio que `PeriodUsageLine` en `reports`. Las REGLAS sí son dominio puro:
`buildClientCreateData`/`buildClientUpdates` (whitelist anti mass-assignment,
`?.trim() || null`, sin fallback de `notification_email` a `contact_email`) y
`assertPortalWebhookEvents`.

División (`modules/clients/`, 18 archivos, ~700 líneas):
- `domain/entities/client.ts`, `domain/services/client-rules.ts`,
  `domain/errors/client-error.ts` (`ClientValidationError` 400,
  `ClientNotFoundError` 404), `domain/repositories/client-repository.ts`.
- `application/ports/{audit-log-writer,api-key-store,webhook-config-store,
  device-registration-gateway}.ts`, `application/dtos/client-dtos.ts`,
  `application/use-cases/{client,client-api-key,client-webhook,
  client-pending-device}-use-cases.ts` (15 casos de uso chicos agrupados por
  agregado, como en `inventory`).
- `infrastructure/database/{knex-client-repository,knex-audit-log-writer}.ts`
  (la consulta de volumen mensual LAG-based movida literal a una constante),
  `infrastructure/adapters/{api-key-service-store,public-webhook-config-store,
  device-registration-service-gateway}.ts`.
- `presentation/{client-controller,client-routes}.ts` — sin `client-view.ts`:
  el wire ya son las filas crudas (ver read models arriba). JSON schemas
  literales conservados.

**Detalles preservados a propósito:** `GET /clients/:id` devuelve `null` (no
404) si no existe; orden de chequeos de `PUT /clients/:id`: 404 → nombre vacío
400 → "Nada para actualizar" 400; `POST /clients/:id/api-keys` responde 201
con la key en claro UNA sola vez; `DELETE api-keys/:keyId` 404 si no existe o
ya estaba revocada; `ip_ranges` de los monitores sólo para scope `all`.

`api/server.ts` — una línea (import de `registerClientRoutes`). Borrados
`api/controllers/clientController/` (6 archivos) y `api/routes/clientRoutes.ts`.

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado (misma
receta; OK previo de las 3 sesiones — `cd-test-83` pidió de acá en más un
aviso por BLOQUE de corridas, no por corrida). Suite completa: **27 de 29
archivos verdes** — `e2e` 37/37, `rbac` 87/87, `pendingDevices` 17/17,
`publicApi` 24/24, `messageTemplates` 13/13, `supplyRequests` 20/20 (los que
pegan a `/clients/*`); los 2 fallos son los mismos ajenos y de entorno
(`observability` pub/sub WS flaky, `twoFactor` 6.3 → 429). `check-sizes.mjs`
limpio tras regenerar baseline (única función >20 líneas nueva:
`registerClientRoutes`, 15 rutas con sus comentarios de RBAC — mismo caso
que `registerAlertRoutes`).

**Nota operativa nueva:** el entrypoint de `timescale/timescaledb` levanta un
servidor TEMPORAL para correr los init scripts y después reinicia; un loop
de `psql select 1` da "listo" contra el temporal y la API que conecta en ese
momento muere con "Connection terminated unexpectedly" al reinicio. Esperar
a `docker logs <pg> | grep -c "init process complete"` = 1 antes de levantar
la API.

## Fase 3 — `devices` migrado (2026-08-24)

Sexto módulo y el más grande/central: ~2.200 líneas en 17 archivos
(`api/controllers/deviceController/{index,shared,reads,crud,lifecycle,merge,
monitor-state,bulk}.ts`, `api/routes/deviceRoutes.ts`,
`services/deviceLifecycleService/{index,bulk,merge,merge-survivor,merge-types}.ts`,
`services/deviceIdentity.ts`, `services/deviceMonitorService.ts`,
`services/deviceRegistrationService.ts`). OK explícito de `close-hp-sds-gaps`,
que tiene 2 fixes de R9 esperando sobre `agentService/config.ts` y
`heartbeatMonitor.ts` — por eso `services/agentService/*` y `jobs/*` sólo
cambian el path del import (fachada con las mismas firmas), nada más.

División (`modules/devices/`, 35 archivos, ~1.900 líneas):
- `domain/entities/device.ts` — `DeviceRow` (read model snake_case con las
  columnas que el módulo LEE + index signature; `devices` es la tabla más
  ancha y otros módulos le agregan columnas — mismo criterio que `ClientRecord`),
  `PendingDeviceRow`, `BulkResult`/`BulkSkip`, `MergeParams`/`MergeResult`,
  `ResolvedDevice`/`MatchedBy`.
- `domain/errors/{device-error,merge-error}.ts` — `DeviceError` con
  `statusCode` (NotFound 404, Validation 400, Merged 409, Conflict 409 con
  `extra` para `collisionId`) y los nombres históricos conservados porque los
  referencian consumidores externos: `MonitorStateError`, `BulkActionError`,
  `DeviceRegistrationError`, `MergeError` + sus 4 subclases.
- `domain/services/device-identity.ts` — la parte PURA de la escalera
  serial → mac → ip: `isIdentifyingSerial` (denylist explícita), `normalizeMac`,
  `NOISE_MODEL_RE`, `identityLockKey`, `shouldRebindAgent` (re-binding sticky
  con gracia 2h + cooldown 24h). `domain/services/merge-rules.ts` — guardas
  de fusión, precedencia de campos del superviviente, metadata de audit.
  `domain/services/device-rules.ts` — whitelist de `PUT /devices/:id`,
  estados de monitoreo válidos, corte de inactividad (7..365 días),
  clasificación PURA de lotes (applied/skipped con motivo) y topes de 500.
- `domain/repositories/{device,device-merge,device-registration}-repository.ts`
  — tres interfaces: lecturas + CRUD + operaciones de fila del ciclo de vida;
  operaciones de fila de la fusión (todas sobre la MISMA trx); cola de registro.
- `application/ports/{audit-log-writer,device-unit-of-work,custom-field-merger,
  device-supplies-reader}.ts` — la unidad de trabajo expone los 3
  repositorios + audit sobre una trx y un `RollbackSignal` para el dry-run
  real de la fusión (se ejecuta y SIEMPRE se revierte, como antes);
  `custom_data` lo valida `modules/inventory` por puerto; los consumibles los
  calcula `services/suppliesService` por puerto.
- `application/use-cases/` — 10 archivos: lecturas (list/get/readings/
  supplies/usage-history/duplicates), `update-device`, `delete-device`,
  `lifecycle-use-cases` (baja con lock+idempotente / reactivación),
  `move-device`, `decommission-stale-devices`, `merge-devices`
  (`MergeDevicesUseCase` con `executeIn(tx)` para componer con la trx de la
  ingesta + `MergeDeviceRequestUseCase` para el endpoint), `monitor-state-use-cases`
  (primitiva única + single + bulk), `bulk-lifecycle-use-cases`,
  `registration-use-cases`.
- `infrastructure/database/` — `knex-device-repository.ts` (+ `device-sql.ts`
  con el self-join de duplicados), `knex-device-merge-repository.ts`,
  `knex-device-registration-repository.ts`, `knex-device-identity-resolver.ts`
  (la resolución contra la base con `pg_advisory_xact_lock`, camino de
  INGESTA — función sobre `trx`, no caso de uso HTTP), `knex-audit-log-writer.ts`,
  `knex-device-unit-of-work.ts` (+ `scopeFor(trx)` para componer con una trx
  ajena). `infrastructure/adapters/` — inventario y consumibles.
- `presentation/{device-controller,device-bulk-controller,device-routes,
  device-wiring}.ts` — 18 rutas con sus JSON schemas literales.
- `index.ts` — fachada: `mergeDevices(db, params, trx?)`,
  `resolveDeviceIdentity(trx, …)`, `isIdentifyingSerial`/`normalizeMac`/
  `NOISE_MODEL_RE`, `setMonitorState`, `listPending`/`registerDevices`/
  `ignoreDevices`/`unignore`, los errores, y
  `createDecommissionStaleDevicesHandler(db)` para `portalAgentRoutes`.

**Detalles preservados a propósito:** `DELETE /devices/:id` respondía con
`e.status ?? 404` + mensaje ante CUALQUIER error (se conserva en el
controller); los errores `Merge*` → 409 (incluido "no existe", ya validado
contra el scope); baja single idempotente (equipo ya de baja → devuelve la
fila sin tocar); `setMonitorState`/`unignore` devuelven `null` si el equipo
no existe; en el bulk de monitor-state un `state` inválido aborta con 400
antes de mutar nada y "fusionado" (409) es por-dispositivo; la reactivación
single sigue sin transacción ni lock (como el original).

Consumidores externos: `services/agentService/{sync-reading,device-registration,
sync-reading-alerts}.ts`, `modules/clients` (gateway de la cola de registro
+ `DeviceRegistrationError`), `api/routes/portalAgentRoutes.ts`
(`decommissionStaleDevices`) y `api/server.ts` — todos sólo cambian el import.
Borrados los 17 archivos originales.

**Deuda aceptada en baseline:** 12 funciones >20 líneas dentro del módulo —
cierres transaccionales con pasos secuenciales + literal de metadata de
audit (`delete`, `decommission`, `move`, `bulkMove`), el `select` de la ficha
(`getDetail`), `matchByIp`, y los registros de rutas/handlers. Partirlas más
fragmentaría flujos atómicos sin ganar claridad; los handlers originales
tenían 40-80 líneas cada uno.

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado (esta
vez esperando `init process complete` de TimescaleDB antes de levantar la
API — ver nota en la pasada de `clients`; OK previo de las sesiones que lo
piden por corrida). Suite completa: **27 de 29 archivos verdes** — los que
ejercitan el módulo: `deviceLifecycle.test.ts` 29/29 (baja/reactivación/
movimiento/fusión con dry-run y solape/bulk), `monitorState.test.ts` 11/11
(incluido el guard estático de inserts en `alerts`), `pendingDevices.test.ts`
17/17, `deviceUsageHistory.test.ts` 7/7, `deviceCosts.test.ts` 9/9,
`inventoryFields.test.ts` 15/15 (`custom_data` vía el puerto), `e2e.test.ts`
37/37 (ingesta con `resolveDeviceIdentity` y fusión automática vía la
fachada), `rbac.test.ts` 87/87, `publicApi.test.ts` 24/24; los 2 fallos son
los mismos ajenos y de entorno (`observability` pub/sub WS flaky, `twoFactor`
6.3 → 429). `check-sizes.mjs` limpio tras regenerar baseline (deuda
aceptada documentada arriba).

## Fase 3 — `agents` migrado, Fase 3 COMPLETA (2026-08-24)

Séptimo y último módulo — el más acoplado: ~3.500 líneas en 28 archivos
(`services/agentService/*` (14), `api/controllers/agentController.ts`,
`api/controllers/portalAgentController/*` (7), `api/routes/{agentRoutes,
portalAgentRoutes}.ts`) y 19 consumidores externos: la clase `AgentService`
se construye una vez en `server.ts` y se inyecta en `authMiddleware`,
`authController`, `ws/`, el dashboard y las rutas. Se esperó a que
`close-hp-sds-gaps` terminara sus fixes de R9 (que al final no tocaron
`agentService/config.ts` — el bug era del portal) antes de leer el código
final.

**Decisión de alcance:** se migra todo lo que es dominio de agentes
(lifecycle, config, registro desde el agente, ingesta de lecturas,
comandos, búsqueda global, presentación de portal y de agente). Se QUEDAN
en `services/` las utilidades puras/compartidas que ya cumplían el
criterio de dominio puro y tienen consumidores propios: `snmpCredentials`,
`ipRangeSpec`, `businessHours`, `cryptoService`, `ewsProxyService`,
`wsTicketService`, `agentVersionService`.

**La fachada ES la clase.** `modules/agents/index.ts` exporta `AgentService`
con el MISMO constructor `(db, redis?)` y los MISMOS métodos/firmas que la
versión anterior (incluida la firma rara pre-existente `syncReadings(redis,
…)` con el parámetro muerto) — cada método delega en su caso de uso, y
expone `useCases` para la presentación del propio módulo. Los 19
consumidores sólo cambian el path del import. `AgentCommandService`
(la usa `jobs/remoteActionWorker.ts`, módulo `remote-actions` del hermano)
se conserva como clase mínima sobre el mismo caso de uso.

División (`modules/agents/`, 54 archivos, ~2.900 líneas):
- `domain/entities/agent.ts` — los payloads de wire del agente
  (`IncomingReading`/`IncomingDevice`/`IncomingLogEntry`/`SystemInfoPayload`/
  `MappedReading`) tal cual, + `AgentRow` (read model), `AgentConfigUpdate`.
- `domain/services/` — TODO lo puro que antes vivía mezclado con Knex:
  `reading-parsing.ts` (parseCount/parseToner, detección de reset de
  contador, identidad cruda, normalización de marca, campos de display,
  fecha), `device-row-builders.ts` (precedencia de campos del equipo
  existente y las dos filas de UPDATE/INSERT — con las 12 columnas de
  cartucho de la Fase 8 factorizadas en tablas), `supplies-details.ts`
  (fusión por secciones, sku/assetNumber, parseo de jsonb),
  `agent-logs.ts` (filas de log + reporte de exportación), `tokens.ts`
  (hash SHA-256, llave de activación 24h, refresh token), `concurrency.ts`
  (pool de N workers + agrupación por identidad cruda),
  `agent-config-view.ts` (traducción de `AgentConfigUpdate` a columnas con
  warnings, compilación de rangos/hosts con fail-open de `credential_ids`,
  `device_policies`, `snmp_community` legacy).
- `domain/repositories/` — 5 interfaces: `agent` (lifecycle/config/
  heartbeat), `agent-command`, `agent-log`, `ingest-device` (las filas de
  `devices`/`readings` del camino caliente del agente — deliberadamente
  separado de `modules/devices`, otro contexto), `agent-portal` (lecturas y
  borrado del portal).
- `application/ports/` — `audit-log-writer`, `token-blacklist` (Redis),
  `ingest-queues` (BullMQ: alertas por lectura + webhook `reading.created`),
  `agent-link` (WSS: push de comandos + broadcast al portal),
  `ews-proxy-gateway`, `device-identity` (resolutor + fusión de fantasmas
  vía `modules/devices`), `alert-notifier` (vía `modules/alerts`),
  `ingest-unit-of-work` (resolver identidad + escribir en UNA trx: el
  advisory lock se sostiene hasta el commit, igual que el original).
- `application/use-cases/` — 12 archivos: lifecycle (5 casos), config (5),
  commands, search, logs, `register-devices` (con el reintento por 23505),
  `process-reading` (el `processReading` original, MISMO orden: identidad →
  upsert/insert → alertas derivadas → EWS → fantasmas → mapped),
  `sync-readings` (touch → contexto → grupos con concurrencia 5 → insert
  idempotente → colas → heartbeat; SIN estado de instancia, es singleton y
  los syncs corren en paralelo), `heartbeat`, portal (list/get/devices/
  delete en cascada) y remoto (comando, scan, toggle EWS, proxy EWS con
  allowlist en dos capas y ventana de staleness).
- `infrastructure/` — 6 repositorios Knex (+ `AGENT_SAFE_COLUMNS`, la
  subconsulta de volumen mensual por agente), writer de audit, 2 unidades
  de trabajo, blacklist Redis, colas BullMQ, adapters WS/EWS/devices/alerts.
- `presentation/` — `agent-wiring.ts` (composición única de todos los casos
  de uso), `agent-controller.ts` (endpoints del AGENTE), `portal-agent-controller.ts`
  (endpoints del PORTAL, un solo traductor de errores: validación de
  config → 400 con `field`, clave de cifrado ausente → 503, dominio → su
  status), `agent-routes.ts` + `portal-agent-routes.ts` (schemas literales,
  rate-limit por agente con `hook: preHandler`).

**Detalles preservados a propósito:** `regenerate-key` responde 404 ante
CUALQUIER error (como antes); `deleteAgent` valida uuid → 400, conflicto
de facturación → 409, otro error → 500 con `details`; `getConfig` del
portal pisa `snmp_credentials` con la vista enmascarada (o lo borra) e
`ip_ranges` con el spec crudo; `getAgent` sólo agrega el bloque `config`
para scope `all`; el `catch` de BullMQ sigue siendo best-effort; el
fallback legacy por agente (agente sin client_id) se conserva en registro
e ingesta.

`api/server.ts` — 3 líneas (import de `AgentService` y de las dos
funciones de rutas). Borrados los 28 archivos originales.

**Validación:** `npx tsc --noEmit` limpio. Entorno efímero aislado (misma
receta; OK previo de las sesiones que lo piden por corrida). Suite
completa: **27 de 29 archivos verdes** — `e2e.test.ts` 37/37 (activación,
heartbeat, sync con 12 equipos en lote, lecturas del mismo equipo en orden,
`supplies_details` corrupto aislado por lectura, reset de contador, refresh
de token, revocación — todo el camino del AGENTE por el módulo nuevo),
`snmpCredentials.test.ts` 29/29, `ipRangesCredentials.test.ts` 12/12,
`portalAgentEws.test.ts` 11/11, `ewsProxyService.test.ts` 8/8,
`remoteActions.test.ts` 16/16 (`AgentCommandService` vía la fachada),
`rbac.test.ts` 87/87, `alerts.test.ts` 32/32 (dedupe de tóner con syncs
concurrentes), `deviceLifecycle.test.ts` 29/29; los 2 fallos son los
mismos ajenos y de entorno (`observability` pub/sub WS flaky, `twoFactor`
6.3 → 429). `check-sizes.mjs` limpio tras regenerar baseline.

**Deuda aceptada en baseline:** 14 funciones >20 líneas en el módulo —
los constructores de fila de la ingesta (`buildExistingDeviceUpdate`/
`buildNewDeviceInsert`/`resolveExistingDeviceFields`, movidos literal y que
YA excedían antes), la composición única de casos de uso
(`buildAgentUseCases`), los registros de rutas/handlers y los `execute`
con pasos secuenciales del camino de ingesta/EWS. Mismo criterio que
`devices`: partirlos más fragmentaría flujos sin ganar claridad.

**Con esto la Fase 3 queda COMPLETA:** `modules/{audit,inventory,alerts,
reports,clients,devices,agents}` migrados con capas, más los módulos que
`close-hp-sds-gaps` escribió directamente con la estructura
(`feedback`, `scheduled-reports`, `supply-requests`, `message-templates`,
`email-log`, `device-costs`, `remote-actions`, `two-factor`,
`system-settings`, `metrics`, `observability`). `pending-devices` no
necesitó módulo propio: su lógica vive en `modules/devices` (registro) y
`modules/clients` la consume por puerto. Quedan en `services/` sólo
utilidades puras/compartidas (`auditService.writeAudit`, `apiKeyService`,
`publicWebhookService`, `suppliesService`, `snmpCredentials`, `ipRangeSpec`,
`businessHours`, `cryptoService`, `ewsProxyService`, `wsTicketService`,
`agentVersionService`, `notificationService`, `incidentService`/
`incidentClassifier`, `reportExportService` ya migrado) y en
`api/controllers` sólo `authController`, `dashboardController`,
`incidentController`, `publicApiController`, `suppliesController` —
candidatos naturales si se quisiera extender la Fase 3, pero fuera del
alcance acordado (`clients, devices, agents, alerts, reports, audit,
inventory, pending-devices`). Siguientes fases: 4 (frontend a
feature-slices) y 5 (enforcement + cobertura).

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
