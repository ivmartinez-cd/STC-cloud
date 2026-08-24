# Plan de Migración a ARCHITECTURE_GUIDE.md

**Estado:** Fase 0, Fase 1 (módulo piloto) y arranque de Fase 2 completos (2026-08-24)  
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

**Pendiente de Fase 2** (orden descendente de tamaño, tabla de Fase 0):
`services/agentService/telemetry.ts` (decomponer `syncReadings`, pasada
dedicada) → `portalAgentController.ts` (610) →
`dashboardController.ts` (593) → `deviceLifecycleService.ts` (516) →
`authController.ts` (385) → `reportService.ts` (355) → `clientController.ts`
(345) → `suppliesService.ts` (301) — más lo que haya crecido por encima de 300
desde que se congeló esa tabla. Frontend (`Settings.tsx` 869, `DeviceDetail.tsx`
772, etc.) sigue sin arrancar.

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
