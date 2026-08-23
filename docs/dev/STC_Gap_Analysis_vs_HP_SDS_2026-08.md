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
  **Lo que NO se hizo**: UI de asignación de `credential_ids` en el portal
  (API-only por ahora), resolución de solapamiento de rangos en runtime
  (sólo warning al guardar).

### Fase 2 — Diferenciación — sin empezar
Ninguno de estos ítems se tocó: API pública (API keys por cliente + webhooks de
lecturas/alertas/cierres — nota: la infraestructura de webhooks de Fase 1 fue para
notificaciones internas, no para esta API pública), remote EWS por túnel sobre el
WSS existente, backend multi-réplica (WS sigue con registro de sockets **en
memoria**, `ws/index.ts:24-25` — no resuelto; `heartbeatMonitor.ts` sigue como
`setInterval` **a propósito**, ver comentario en el archivo: convertirlo a BullMQ
repeatable job es riesgoso mientras la Redis de producción use
`maxmemoryPolicy: allkeys-lru`), agregados continuos, familias de marcas nuevas
(Ricoh/Kyocera/Brother/Xerox/Canon/Konica — siguen cayendo a `generic` o con OIDs
parciales, §3 R8), mejoras de agente (rollback de update, activación offline,
"mantener datos" al desinstalar), y documentación (comparativa v2.0, inventario de
datos, auditoría IT).

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
- **R5**: `UpdateService.ts` sigue omitiendo la firma si `UPDATE_PUBLIC_KEY_HEX`
  es el placeholder, y sin rollback — no tocado.
- **R6**: versión unificada en agente/cloud (Fase 0, hecho), pero **no** entre
  esos dos y el instalador Inno Setup / el proyecto C# del Monitor UI — sigue
  siendo 4 ecosistemas de versión distintos.
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
| API pública / ISV | SDS API para MPS | Ninguna (sin API keys, sin webhooks) | API keys por cliente + webhooks (lecturas, alertas, cierres) | P1 |
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

### R6 · Release, versionado y build — **P1**
- `VERSION` hardcodeada en `main.ts`, `HeartbeatService.ts`, `UpdateService.ts`, `CliCommands.ts` (1.0.0) y `ConsoleEngine.ts` (**1.2.0**); `package.json`, `.iss`, `.csproj` aparte.
- Tres builds: `build-sea.js` (esbuild `node24` + copia `process.execPath`, sin `postject`), `build:agent` raíz (pkg `node18-win-x64`), `@types/node ^20`. CI construye el de pkg; el instalador empaqueta el de esbuild → **CI no produce lo que se instala**; `capture.test.ts` no corre en CI; e2e del backend nunca corre en CI.
- Instalador y Monitor UI con `http://localhost:3000` por defecto; hostnames del backend: `stc-cloud.onrender.com` (vercel.json, Terminal.tsx), `stc-cloud-api.onrender.com` (build‑installer, docs) — uno está mal.
- Desinstalar borra la cola local sin opción.

### R7 · Zona horaria y multi‑país — **P1**
TZ fija en agente (`BusinessHours.ts`, `Logger.ts`), servidor (`-03:00`, `portalAgentController.ts:25`) y portal (`es-AR`). Primer cliente en Chile/México/España rompe horario laboral y cierres mensuales.

### R8 · Cobertura de marcas — **P1**
Familias reales sólo HP/Samsung/Lexmark (18 perfiles). Ricoh/Brother/Xerox → `generic.ews` + OIDs parciales (`BROTHER_OIDS.totalPages` vacío; Xerox mono=color). Canon, Kyocera, Konica Minolta, Epson, Sharp, Toshiba, OKI, Pantum ni siquiera son `Brand` → caen a `generic` (Printer‑MIB sirve para total/insumos, pero sin desglose color ni alertas ricas). En un MPS multimarca esto limita la promesa comercial.

### R9 · Portal — **P1**
Sin paginación (500 equipos = inusable), 3 tipos `Alert` distintos, tipo `MonitorData.config` miente (se parsea como string), `Terminal.tsx` hardcodea `wss://stc-cloud.onrender.com`, 401 hace `location.replace` y pierde la ruta, Settings guarda umbral offline en `localStorage`. Sin tests.

### R10 · Documentación divergente — **P2**
Ver §1. Especialmente `data_collection_inventory.md` (privacidad) y los HTML de auditoría IT que describen la cascada vieja, PBKDF2 100k y "SNMP sólo identificación".

---

## 4. Roadmap propuesto para pasar "por encima de lo básico"

### Fase 0 — Parar hemorragias (1–2 semanas) — ✅ completa (ver "Estado de implementación")
1. ✅ `purgeOld`: borrar sólo `synced = 1`; lo no sincronizado se conserva (o se archiva) y se alerta. Backpressure en los 3 loops. Queue size en el heartbeat.
2. ✅ Idempotencia: `reading_id` UUID por lectura + `batch_id`; servidor `ON CONFLICT DO NOTHING` con unique `(device_id, time)`; respuesta con `accepted/rejected` por lectura.
3. ✅ Migración de reconciliación: hypertable + compresión + `readings.supplies_details` + índices `(device_id,time)`, `alerts(device_id,resolved)`, `audit_logs(created_at)`. Quitar el hack `.ts↔.js`. ✅ `add_retention_policy` (23/08/2026): `readings` 24 meses nativo TimescaleDB; `agent_logs` 90 días y `alerts` resueltas 12 meses vía job app-level (`retentionJob.ts`); `audit_logs` sin purga (write-only, decisión de negocio). Agregados continuos siguen sin implementarse (Fase 2).
4. ✅ Detección de reset/decremento en servidor al ingerir (marcar lectura, abrir alerta `counter_reset`) y en el cálculo mensual (sumar deltas positivos en vez de `MAX−MIN`).
5. ✅ Seguridad mínima: CSRF (double‑submit), quitar login por env, no devolver token en body¹, `trustProxy`, schema en `PUT /agents/:id/config` y `createClient`, audit en deletes/comandos. ⬜ WS sigue aceptando `?token=` en query string — no se sacó.
6. ✅ Operación: `restart: unless-stopped`, `/health` real (DB+Redis), límites de recursos, `USER node`, `npm ci`; sacar binarios/dumps/secretos del repo y rotar `JWT_SECRET`/DB password.
7. ⬜ Una sola fuente de versión: ✅ hecho en agente/cloud (`version.ts`); **sigue sin unificarse** con el instalador Inno Setup ni el `.csproj` del Monitor UI (siguen siendo ecosistemas de versión aparte). ✅ (23/08/2026) `capture.test.ts` y e2e de `cloud` corren en CI (Postgres/Redis como service containers en `.github/workflows/ci.yml`, job `api`).

¹ `/portal/me` y la respuesta de login siguen devolviendo el token también en el body (fallback para el WS cuando no hay cookie entre orígenes) — es una decisión consciente, no un pendiente.

### Fase 1 — Paridad operativa con SDS (≈ 1 mes) — completa: 9 de 9 ítems cerrados
- ✅ **Alert loop** — lifecycle server-side completo: alertas `agent_offline`, `device_offline`, `counter_reset` (ya de Fase 0), normalización de las alertas EWS que ya llegaban del agente; **ack/resolve** y filtros; **notificaciones** email + webhook. ⬜ El loop *dedicado 3/15 min del lado agente* no se tocó (las alertas del agente siguen en el loop de supplies, 60/240 min); ⬜ digest diario no implementado.
- ✅ **Reportes por cliente**: selector de período, cierre mensual inmutable (lectura inicial/final, delta, fuente), export CSV/XLSX, y **entrega automática** (email/webhook) para reemplazar el flujo FTP/mail del STC legado. ⬜ Export a PDF y entrega por SFTP no se hicieron (quedó CSV/XLSX + email/webhook).
- ✅ **RBAC por cliente**: rol `client_viewer`, scoping por `client_id` en todos los controladores. ⬜ Paginación server‑side no se hizo (sigue sin paginación ninguna tabla del portal).
- ✅ **SNMPv3 y lista de credenciales** (v1/v2c/v3) por agente, hasta 8 credenciales probadas en orden, secretos cifrados at-rest, fail-fast para no multiplicar timeouts contra un host muerto.
- ✅ **CIDR + tope de rango + exclusiones**: `ip_ranges` acepta CIDR y exclusión de IPs individuales, compilado del lado cloud a pares planos (cero cambios en el agente); tope de 2000 IPs declaradas por agente, validado en cloud y reforzado en el agente. ⬜ Exclusión de sub-rangos/CIDR anidados e IPv6 quedan fuera.
- ✅ **Horario laboral y TZ configurables** por agente: `agents.business_hours` (jsonb, default = comportamiento hardcodeado de siempre), enviado en heartbeat config; de paso corrige el offset `-03:00` hardcodeado al ingerir logs/lecturas naive de agentes viejos, usando el TZ real del agente. ⬜ Cosmética de locale del portal (`es-AR`) queda para una pasada de polish aparte.
- ✅ `scan_schedule`: eliminado como código muerto (columna, tipo, y todo su manejo en cloud) — se había implementado y reemplazado deliberadamente por el modelo de 3 loops + horario laboral 4 días después, en mayo; el backend nunca se limpió hasta ahora. No se reimplementó: sin spec vigente que pida un scheduler tipo cron conviviendo con horario laboral.
- ✅ **Resolución de hostname (point lookup) + credenciales SNMP por rango**: `ip_ranges` acepta un tercer tipo de entrada `{hostname}` resuelto por el agente en cada ciclo (el cloud no tiene visibilidad de la DNS interna del cliente); cada entrada admite `credential_ids?` para restringir qué credenciales se prueban en ESE rango durante discovery, con fail-open ante ids colgantes y warnings no bloqueantes (rangos superpuestos con credenciales distintas, borrado de una credencial referenciada). ⬜ UI de asignación de `credential_ids` en el portal queda para después (API-only); restricción por rango en meter/supplies no se hizo (`known_devices` no tiene vínculo a rango, y no aporta valor real ahí).
- ✅ Identidad `(client_id, serial)` + MAC secundaria + merge de duplicados; decommission/mover/editar dispositivo.

### Fase 2 — Diferenciación (2–3 meses) — sin empezar, ningún ítem tocado
- API pública con API keys por cliente + webhooks (lecturas, alertas, cierres) → integración ERP.
- Remote EWS por túnel sobre el WSS existente (allowlist, TTL, audit), consola con paridad IMIL (listar dispositivos, MIB walk remoto, deshabilitar monitoreo por equipo, reenviar lecturas, descubrir IP puntual).
- Backend multi‑réplica: pub/sub Redis para WS, jobs BullMQ repetibles (heartbeat monitor), métricas Prometheus, Sentry, logs estructurados sin `console.log`.
- Agregados continuos (diario/mensual por equipo) y dashboard sobre ellos.
- Familias nuevas: Ricoh WIM, Kyocera CCX, Brother BMS, Xerox WS, Canon, Konica; fixtures reales por modelo; matriz de cobertura de scopes visible en el portal (columna Driver + scopes).
- Agente: rollback de update, activación offline, "mantener datos" al desinstalar, dedupe de lecturas idénticas (enviar si cambia o cada N horas), detección de PJL deshabilitado, log rotation real.
- Documentación: reescribir comparativa v2.0, inventario de datos (privacidad), auditoría IT; política de retención y DPA publicadas.

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
