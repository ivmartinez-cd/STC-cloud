# Auditoría de cumplimiento — `docs/dev/ARCHITECTURE_GUIDE.md`

**Fecha:** 2026-09-08
**Alcance:** los 12 capítulos de la guía, contrastados contra el código real de `cloud/`, `agent/`, `cloud/portal/` y la configuración de CI.
**Método:** ejecución de las guardas (`npm run check:arch -w cloud`) más verificación manual/scripted de cada regla que las guardas no cubren. Todo lo afirmado acá es reproducible con los comandos citados.

---

## Resumen

| | Reglas |
|---|---|
| Cumple, verificado | 12 |
| Gap abierto | 7 |
| No concluyente (requiere revisión manual) | 1 |

Las reglas de **mayor impacto estructural** —dirección de dependencias, fronteras entre módulos, pureza del dominio, tamaño de archivo, autenticación por endpoint— se cumplen sin excepciones y con el baseline de guardas **vacío**. Los gaps abiertos son de proceso (§9/§12), de higiene (§4) y uno de cobertura de CI que sí merece acción inmediata (**A**).

---

## 1. Cumple — verificado

| # | Regla | Evidencia |
|---|---|---|
| 1 | §2/§3 Estructura módulo → capa | 24 módulos en `cloud/src/modules/`, cada uno con `domain/ application/ infrastructure/ presentation/`. |
| 2 | §3 Dirección de dependencias | `check-guards` → 0 hallazgos, y `guards-baseline.json` es `{}` (sin deuda congelada). |
| 3 | §3 Pureza del dominio | 91 archivos bajo `modules/*/domain/`; ningún import de paquete npm. Sólo `crypto` y `net` (builtins de Node, uso puro: `createHash`, `randomBytes`, `net.isIP`). |
| 4 | §4 Tamaño de archivo (300 líneas) | `check-sizes` sobre 892 archivos; `sizes-baseline.json → files: {}` (cero archivos congelados). |
| 5 | §6 Jerarquía de errores | `shared/domain/errors/` implementa `app-error`, `domain-error`, `application-error`, `infrastructure-error` — exactamente el árbol de la guía. |
| 6 | §7 Umbrales de cobertura | `check-coverage.mjs:24` → `{domain:90, application:85, infrastructure:70, presentation:60}`, idéntico a la tabla de §7. |
| 7 | §8 Autorización deny-by-default | `check-routes` → 191 rutas, 10 públicas declaradas. Falla si una ruta nueva no declara `preHandler`. |
| 8 | §8 Sin secretos en el código | Barrido de literales tipo password/secret/api_key en `cloud/src` (excluyendo tests): 0 hallazgos. |
| 9 | §9 Conventional Commits | 60/60 de los últimos 60 commits cumplen el formato y los tipos válidos. |
| 10 | §10 ADRs | `docs/adr/001..004` — adopción de la guía, los dos ratchets y el modelo de autorización. |
| 11 | §12 Migraciones reversibles | 72/72 migraciones de Knex definen `down()`. |
| 12 | §12 Variables de entorno documentadas | 32 de 33 variables usadas en código están en `.env.production.example` (que cumple el rol del `.env.example` de §2 y está trackeado). Falta sólo `AGENT_DATA_DIR` → ver gap **G**. |

---

## 2. Gaps abiertos

### A. 13 de 65 archivos de test nunca corren en CI — **ALTA**

`cloud/scripts/ci-test-runner.mjs` mantiene la lista `TEST_FILES` **a mano**, y quedó desfasada del disco. El job `api` de CI corre 52 archivos; en `cloud/src/tests/` hay 65.

No corren en CI:

```
activitySavedViews          agentAuditClientId        alertsRegressionAndScope
auditSummary                clientSupplyThresholdDefault   deviceDetail
deviceDetailPure            globalIncidentRules       incidentsStatsAndFilters
monitorDetail               reportsDeltaEstimateApplied   reportsPeriodInvariant
supplyRequestsDuplicatesAndWindow
```

Dos consecuencias:

1. Viola §12 ("CI verde obligatorio antes de merge"): el CI verde no significa lo que se cree que significa.
2. **La cobertura de §7 se calcula sobre una suite incompleta.** `check-coverage.mjs` consume el `NODE_V8_COVERAGE` de esos 52 archivos, así que los umbrales 90/85/70/60 se están midiendo con ~20 % de los tests apagados. El umbral se cumple, pero sobre menos evidencia de la disponible.

Detalle con filo: `agentAuditClientId.test.ts` —el test que cubre justamente el gap **C** de más abajo— es uno de los que no corre.

El archivo ya tiene un comentario de una corrección anterior del mismo tipo (`clientDirectory`/`clientDeviceDirectory` "faltaban acá"), o sea que es un modo de falla recurrente: la lista hardcodeada es el problema, no las 13 entradas.

**Los 13 archivos pasan.** Verificado el 2026-09-08 sobre stack efímero (Postgres 55432 / Redis 56379, API en 3100, procedimiento de `suite_local_run_procedure`): **13/13 archivos OK, 98 tests, 0 fallas**.

| Archivo | Tests | Archivo | Tests |
|---|---|---|---|
| `activitySavedViews` | 10 | `globalIncidentRules` | 6 |
| `agentAuditClientId` | 2 | `incidentsStatsAndFilters` | 6 |
| `alertsRegressionAndScope` | 5 | `monitorDetail` | 20 |
| `auditSummary` | 6 | `reportsDeltaEstimateApplied` | 5 |
| `clientSupplyThresholdDefault` | 3 | `reportsPeriodInvariant` | 8 |
| `deviceDetail` | 11 | `supplyRequestsDuplicatesAndWindow` | 5 |
| `deviceDetailPure` | 11 | | |

O sea: no hay deuda escondida detrás de este gap. Prenderlos en CI es un cambio de bajo riesgo y sube la cobertura medida sin tocar una línea de código de producción.

**Estado: CORREGIDO (2026-09-08).** `ci-test-runner.mjs` ahora descubre del disco: `KNOWN_ORDER` fija la secuencia histórica y todo `.test.ts` que no esté listado se agrega **al final**. Un archivo nuevo entra a CI por existir; los 52 que ya corrían mantienen su orden exacto.

**Por qué no se alfabetizó** (el diseño obvio, y era incorrecto): se probó ordenar todo alfabéticamente y `ewsProxyRelay.test.ts` empezó a fallar de forma **reproducible** — 2 corridas limpias, misma assertion. Ese test publica en `stc:ws:ews-push` y espera **800 ms fijos** a que el mensaje llegue al socket; al pasar del puesto 48 al 33 dejó de dar tiempo. Aislado pasa 3/3. Con el orden restaurado, pasa.

Deuda que esto destapó, para otra pasada: **hay al menos dos tests de pub/sub WS que dependen de un `sleep` fijo** en vez de esperar la condición —`ewsProxyRelay` (800 ms) y `observability` (que ya lleva 3 commits de estabilización: `be6dec0`, `bb63e4a`, `2008b4f`)—. Mientras sea así, el orden de la suite es carga acoplada y mover archivos es riesgoso. La corrección de fondo es reemplazar los sleeps por espera de evento con timeout.

**Verificación de la corrección** (stack efímero limpio, 3 corridas de suite completa):

| Corrida | Orden | Resultado |
|---|---|---|
| 1 | alfabético | 64/65 — falla `ewsProxyRelay` |
| 2 | alfabético, DB nueva | 64/65 — falla `ewsProxyRelay` (reproducible → causado por el orden) |
| 3 | `KNOWN_ORDER` + append (final) | 64/65 — falla `observability` (flake preexistente, pasa 3/3 aislado) |

La corrida 3 no tiene fallas atribuibles al cambio: los 52 archivos previos corren en el orden idéntico al de hoy, así que cualquier falla entre ellos también ocurre en el CI actual.

---

### B. §5.4 — versiones no fijadas — **MEDIA**

La guía exige `"express": "4.18.2"`, no `"^4.18.2"`, en producción. En `cloud/package.json`: **28 de 28** dependencias (prod + dev) usan rango `^`.

Mitigación real existente: `package-lock.json` está commiteado y CI usa `npm ci`, así que las builds **sí** son reproducibles. El riesgo remanente no es la build sino el `npm install` de un dev o una regeneración de lock, que puede traer un minor no auditado.

**Decisión a tomar:** o se fijan las versiones, o se anota en la guía que el lockfile cumple el objetivo de §5.4 en este repo. Hoy la guía dice una cosa y el repo hace otra, y eso es lo que hay que cerrar.

---

### C. §8.8 — escrituras directas a `audit_logs` sin `client_id` — **MEDIA**

§8.8 exige escribir vía `cloud/src/services/auditService.ts`, que garantiza que `client_id` se setee siempre. Quedan **3 sitios** que insertan directo y **ninguno setea `client_id`**:

| Archivo | Acciones |
|---|---|
| `modules/devices/infrastructure/database/knex-device-identity-resolver.ts:68,83` | `DEVICE_IP_REASSIGNED`, `DEVICE_AGENT_REASSIGNED` |
| `modules/auth/infrastructure/adapters/knex-user-audit-gateway.ts:20` | `USER_UPDATED`, `USER_DELETED` |
| `modules/feedback/infrastructure/database/knex-audit-log-writer.ts:8` | acciones de feedback |

Consecuencia concreta: `knex-audit-log-repository.ts:37` filtra con `andWhere("a.client_id", filter.clientId)`, así que estas filas **son invisibles** cuando el feed de auditoría se filtra por cliente. Aparecen sin filtrar o filtradas por acción/fecha/target.

**Nota:** el docstring de `auditService.ts` dice que quedan "~19 call-sites" — **está desactualizado, son 3**. Conviene corregirlo aunque no se cierre el gap ahora, porque hoy sobreestima el trabajo pendiente por un factor de 6.

---

### D. §9/§12 — Gitflow y revisión por PR — **MEDIA (contextual)**

- §9 define `main` / `develop` / `feature/*` / `fix/*` / `release/*` / `hotfix/*`. El repo tiene **sólo `main`**; se commitea directo.
- §12 exige "al menos 1 reviewer antes de merge" y "no mergear el propio PR sin review". Sin PRs, la regla no se cumple estructuralmente.

Es el gap más defendible: con un solo desarrollador, exigir reviewer es imposible y una rama `develop` sólo agrega ceremonia. Pero **la guía dice lo que dice**, y un auditor externo lo va a marcar.

**Decisión:** ajustar §9/§12 a la realidad del equipo (trunk-based documentado, CI verde como gate obligatorio en lugar del reviewer), con un ADR que lo justifique. Es más honesto que dejar una norma que se incumple por diseño.

---

### E. §4 — nomenclatura kebab-case fuera de `modules/` — **BAJA**

159 de 599 archivos `.ts/.tsx` de `cloud/src` no son kebab-case (27 %). Distribución:

| Área | Archivos |
|---|---|
| `src/db` | 75 (migraciones Knex — el prefijo timestamp lo impone la herramienta, **no cuenta**) |
| `src/tests` | 59 (camelCase: `alertDigest.test.ts`) |
| `src/jobs` | 11 |
| `src/services` | 11 |
| `src/api` | 3 |
| **`src/modules`** | **0** |

El dato importante es la última fila: **todo lo migrado a la arquitectura nueva cumple**. La deriva está en las áreas que la migración no tocó.

---

### F. §12 — tamaño de cambio ≤ 400 líneas — **BAJA**

De los últimos 30 commits: mediana **124** inserciones, pero **5 superan 400** (máx. 1543). Los excedidos son reorganizaciones de `docs/` y migraciones de módulo completas — atómicas por naturaleza, difíciles de partir sin dejar el repo en estado intermedio roto.

---

### G. §2/§12 — `AGENT_DATA_DIR` sin documentar — **BAJA**

Única variable de entorno usada en código y ausente de `.env.production.example`. Es del agente, y el ejemplo está orientado al cloud — pero la regla no distingue.

---

## 3. No concluyente

### §11.3 — paginación obligatoria en endpoints de colección

16 de 59 archivos de `presentation/` mencionan `limit`/`page`/`offset`/`cursor`, sobre 80 handlers `GET`. La proporción **no permite concluir nada**: muchos GET devuelven un recurso único o un agregado, donde la regla no aplica. Verificarlo requiere clasificar handler por handler cuáles devuelven colecciones sin cota — no se hizo en esta pasada.

---

## 4. Acciones recomendadas, por orden

1. **A** — arreglar el descubrimiento de tests en `ci-test-runner.mjs`. Es el único gap que degrada una garantía activa (CI verde + cobertura).
2. **C** — cerrar los 3 call-sites de `audit_logs` y corregir el docstring de `auditService.ts`.
3. **D** — decidir Gitflow vs trunk-based y alinear la guía con la realidad, vía ADR.
4. **B** — decidir fijado de versiones vs lockfile, y dejarlo escrito en §5.
5. **G** — agregar `AGENT_DATA_DIR` al `.env.production.example`.
6. **E/F** — oportunista, sin acción dedicada.

---

## 5. Reproducir esta auditoría

```bash
npm run check:arch -w cloud          # guardas 1, 2, 4, 7 del cuadro de cumplimiento
node -e '...'                        # los conteos puntuales están en el cuerpo de cada ítem
git log -60 --format=%s              # §9
```
