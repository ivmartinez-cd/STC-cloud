# ESTADO DEL PROYECTO — STC Cloud
## Sistema de Toma de Contadores Multimarca

**Última actualización:** 2026-05-07  
**Versión del documento técnico analizado:** v1.0 (5 de mayo de 2026)

---

## Resumen Rápido por Fase

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Infraestructura Base | ✅ COMPLETADA |
| 2 | Backend API | ✅ COMPLETADA |
| 3 | Agente Windows | ✅ COMPLETADA |
| 4 | OIDs SNMP por Marca | ✅ COMPLETADA |
| 5 | Portal Web | ✅ COMPLETADA |
| 6 | Seguridad y Hardening | ✅ COMPLETADA |
| 7 | Testing y Piloto | ✅ COMPLETADA |
| 8 | Producción | ❌ PENDIENTE |

---

## FASE 1 — Infraestructura Base ✅ COMPLETADA

### Completado
- [x] Node.js 20 + Fastify 4.x (backend)
- [x] PostgreSQL 16 + TimescaleDB — migration con hypertable + compresión 7 días
- [x] Redis 7 (ioredis)
- [x] BullMQ — alertWorker funcional
- [x] Estructura `/cloud/src/{api, services, jobs, db}`
- [x] Portal React + Vite + TailwindCSS
- [x] Knex.js con migrations versionadas
- [x] `/cloud/docker/docker-compose.yml` — todos los servicios (api, portal, postgres/timescale, redis, nginx)
- [x] `/cloud/docker/Dockerfile` — backend API
- [x] `/cloud/docker/Dockerfile.portal` — portal React
- [x] `/cloud/docker/nginx.conf` — reverse proxy con SSL ready
- [x] `/cloud/src/ws/index.ts` — WebSocket hub para tiempo real del portal
- [x] `/shared/types.ts` — tipos TypeScript compartidos (agent, device, reading, command)
- [x] `/shared/security.ts` — AES-256-GCM encrypt/decrypt con PBKDF2 (usado por el agente)
- [x] `cloud/tsconfig.json` — compilación TypeScript del backend

---

## FASE 2 — Backend API ✅ COMPLETADA

### Completado
- [x] `POST /api/v1/agents/activate` — activación con one-time key + TTL 24h
- [x] `POST /api/v1/agents/refresh` — renovación con validación real de `refresh_token_hash`
- [x] `GET /api/v1/agents/:id/commands` — cola de comandos Redis
- [x] `POST /api/v1/agents/:id/heartbeat` — heartbeat del agente
- [x] `POST /api/v1/devices/sync` — recepción de lecturas en batch (hasta 500, con schema)
- [x] `POST /api/v1/devices/register` — registro de nuevas impresoras
- [x] `GET /api/v1/clients` — lista de clientes (protegido portal)
- [x] `GET /api/v1/clients/:id/devices` — JOIN correcto client→agents→devices
- [x] `POST /api/v1/agents/:id/command` — envío de comandos (cola Redis, enum validado)
- [x] `PUT /api/v1/agents/:id/config` — actualiza ip_ranges y snmp_community en BD
- [x] `GET /api/v1/dashboard` — stats en paralelo (Promise.all)
- [x] `GET /api/v1/devices/:id/readings` — serie temporal con filtros from/to/limit
- [x] `POST /api/v1/agents/:id/revoke` — revoca agente (blacklist Redis + status 'revoked')
- [x] `POST /api/v1/portal/login` — JWT de portal (role: 'portal', TTL 8h)
- [x] Autenticación separada: `agentAuth` vs `portalAuth` por ruta
- [x] Expiración `activation_key` — campo `activation_expires_at` en BD + validación
- [x] JSON Schema validation en activate, refresh, sync, command, createAgent, portalLogin
- [x] Rate limiting con Redis como store (multi-instancia)
- [x] JWT_SECRET lanza error fatal si no está en .env (no más fallback inseguro)
- [x] Migration `20260506000002` — columnas `refresh_token_hash` y `activation_expires_at`
- [x] Audit log con IP del request en `revokeToken`

### Bugs Corregidos
- [x] ~~Bug #1~~ — `refreshAgentToken` ahora valida `agentId` + SHA-256 del refresh_token
- [x] ~~Bug #2~~ — `GET /clients/:id/devices` hace JOIN correcto a través de `agents`
- [x] ~~Bug #3~~ — `updateConfig` actualiza `ip_ranges`, `snmp_community` y `name` en BD
- [x] ~~Bug #4~~ — IP hardcodeada eliminada; usa `r.ip` del payload o `null`

---

## FASE 3 — Agente Windows ✅ COMPLETADA

### Completado
- [x] `agent/src/core/main.ts` — entrada principal con 3 loops y CLI `--activate`
- [x] Loop 1: Heartbeat cada 60s (version, memoria, endpoint `/heartbeat`)
- [x] Loop 2: Scanner SNMP cada N min (configurable desde `config.scanIntervalMinutes`)
- [x] Loop 3: Sincronizador SQLite → Cloud cada 5 min (batches de 500)
- [x] `agent/src/core/config.ts` — AES-256-GCM con clave derivada de MAC + serial de disco
- [x] `agent/src/sync/database.ts` — SQLite real con `better-sqlite3` (WAL mode, retención 7 días)
- [x] `agent/src/sync/uploader.ts` — upload con retry y refresh automático de JWT
- [x] `agent/src/install/install.js` — `node-windows` SCM de Windows
- [x] `agent/src/install/uninstall.js` — desinstalador limpio
- [x] `agent/build/build.bat` — empaquetado `.exe` con `pkg`
- [x] `agent/tsconfig.json` — compilación TypeScript
- [x] Backpressure: si >10.000 lecturas pendientes, scan se omite
- [x] Log rotativo 10 MB (`agent.log` → `agent.log.1`)
- [x] Cierre limpio con SIGINT/SIGTERM
- [x] `package.json` actualizado: `better-sqlite3` en lugar de JSON file, `axios` eliminado

---

## FASE 4 — OIDs SNMP por Marca ✅ COMPLETADA

### Completado
- [x] `agent/src/snmp/oids.ts` — mapa completo de OIDs estructurado por marca
- [x] OIDs universales RFC 3805 (`prtMarkerLifeCount`, `prtMarkerSuppliesLevel`, `prtGeneralSerialNumber`, etc.)
- [x] OIDs privativos HP (enterprise 11) — contador, color, mono, serial
- [x] OIDs privativos Lexmark (enterprise 641) — contador y serial
- [x] OIDs Samsung legacy (enterprise 236) — contador total y color
- [x] `agent/src/snmp/scanner.ts` — reescrito con OID maps + fallback completo
- [x] Identificación de marca por `sysObjectID` (`detectBrandFromOid`)
- [x] Lógica de fallback: OID privativo → OID genérico si falla o devuelve 0
- [x] Cálculo de porcentaje de toner (`Level / MaxCapacity * 100` si MaxCapacity > 100)
- [x] Manejo de valores negativos (-1/-3 → null = desconocido)
- [x] Semáforo: máx 20 requests SNMP simultáneos
- [x] `hrPrinterStatus` mapeado a string legible (idle/printing/warmup/etc.)

---

## FASE 5 — Portal Web ✅ COMPLETADA

### Completado
- [x] Layout base con sidebar y header
- [x] Dashboard: tarjetas de stats + lecturas recientes (conectadas al API)
- [x] Gestión de agentes: generación de activation key
- [x] Login / autenticación del portal — `pages/Login.tsx` + `context/AuthContext.tsx`
- [x] Rutas protegidas — `RequireAuth` en `App.tsx`, redirige a `/login` si no autenticado
- [x] API client centralizado — `lib/api.ts` con Bearer token + redirección 401 automática
- [x] Vite proxy — `/api` → `localhost:3000` en dev, nginx en producción
- [x] Dashboard conectado — usa `lib/api.ts`, gráfico de barras con recharts, alertas reales
- [x] Alertas Críticas en Dashboard — valor real del backend (conteo de revocaciones)
- [x] Lista de clientes — `pages/Clients.tsx` con datos reales del API
- [x] Detalle de cliente — `pages/ClientDetail.tsx` con grid de dispositivos + estado online/offline
- [x] Detalle de dispositivo — `pages/DeviceDetail.tsx` con `LineChart` de contadores y barras de toner
- [x] Reportes — `pages/Reports.tsx` con selector cliente/dispositivo/fechas + exportación CSV
- [x] Configuración — `pages/Settings.tsx` con umbrales de toner y config SMTP
- [x] Tabla de agentes con datos reales — `GET /api/v1/agents` (endpoint agregado al backend)
- [x] Botón "Revocar" funcional — llama `POST /api/v1/agents/:id/revoke`
- [x] Formulario de nuevo agente mejorado — selector de cliente + nombre antes de generar key
- [x] Logout — botón en sidebar, limpia localStorage
- [x] Nav actualizado — Dashboard, Clientes, Agentes, Reportes, Configuración

### Pendiente (mejoras futuras)
- [ ] Integración WebSocket para actualizaciones en tiempo real sin polling
- [ ] Módulo de dispositivos independiente (`/devices`) con filtros globales
- [ ] Exportación PDF de reportes

---

## FASE 6 — Seguridad y Hardening ✅ COMPLETADA

### Completado
- [x] JWT 30 días (access token)
- [x] Blacklist Redis (`isBlacklisted` + `revokeToken` en AgentService)
- [x] Rate limiting global (100 req/min)
- [x] Tabla `audit_logs` con migración
- [x] Audit log en `revokeToken` y `updateConfig`
- [x] Variables de entorno con dotenv (`.env`)

### Completado en fases 2–5
- [x] Fix refresh token — `refresh_token_hash` en BD (Fase 2)
- [x] JWT separado portal vs agente — `agentAuth` / `portalAuth` helpers (Fase 2)
- [x] Rate limiting con Redis como store (Fase 2)
- [x] JSON Schema validation en todos los endpoints de Fastify (Fase 2)
- [x] JWT_SECRET — lanza error fatal si no está en .env (Fase 2)
- [x] AES-256-GCM para config del agente — `config.ts` del agente (Fase 3)
- [x] Audit log con IP del request en `revokeToken` (Fase 2)

### Completado en Fase 6
- [x] `hardware_id` en tabla `agents` — migration 0003 + `activateAgent()` lo guarda
- [x] Tabla `alerts` — migration 0003, campos: type, severity, message, value, resolved
- [x] `contact_email` en tabla `clients` — migration 0003
- [x] `alertWorker.ts` — inserta/resuelve alertas en BD con umbrales configurables (env)
- [x] `GET /api/v1/alerts` — endpoint portal para ver alertas activas/resueltas
- [x] Dashboard: "Alertas Activas" conectado a tabla `alerts` (no REVOKE_TOKEN)
- [x] CORS restringido — `PORTAL_ORIGIN` env var (no más `origin: true`)
- [x] `@fastify/helmet` — security headers desde capa de aplicación
- [x] Rate limit estricto en auth: `/portal/login` 10/min, `/agents/activate` 5/min
- [x] Certbot en `docker-compose.yml` — renovación automática cada 12h
- [x] Backup PostgreSQL en `docker-compose.yml` — pg_dump diario, retención 30 días
- [x] `nginx.conf` hardening — TLSv1.2+, session cache, OCSP, CSP, rate limit nginx
- [x] `certbot-init.sh` — script de generación inicial de certificado SSL
- [x] `.env.production` — template completo de variables de entorno
- [x] Audit log en activaciones — `AGENT_ACTIVATED` en `audit_logs` (ya estaba desde Fase 2)
- [x] Rotación de refresh tokens — `refreshAgentToken` ya rotaba (ya estaba desde Fase 2)

---

## FASE 7 — Testing y Piloto ✅ COMPLETADA

### Tests automáticos implementados

- [x] **`agent/src/tests/scanner.test.ts`** — 16 unit tests para `tonerPct`, `hrStatus`, `detectBrandFromOid`
  - Valores negativos (-1/-3 → null)
  - max≤100: porcentaje directo (HP FutureSmart)
  - max>100: cálculo nivel/máximo (Lexmark/Samsung raw units)
  - Detección de marca por prefijo de enterprise OID
  - Edge cases: strings, null, overflow, unknown OIDs
- [x] **`agent/src/tests/queue.test.ts`** — 10 tests para la cola SQLite
  - Enqueue/dequeue de lecturas
  - `markSynced` y `pendingCount`
  - Límite de batch en `getPendingReadings`
  - `purgeOld` limpia registros sincronizados
  - `upsertKnownDevice` + `isRegistered`
  - Usa directorio temporal (no toca datos de producción)
- [x] **`cloud/src/tests/e2e.test.ts`** — 18 integration tests del ciclo completo
  - Portal login (válido e inválido)
  - Dashboard stats
  - CRUD de agentes con portal JWT
  - Activación con one-time key
  - Reutilización de key (debe fallar)
  - Heartbeat con token de agente
  - Rechazo de token de portal en rutas de agente
  - Registro de dispositivos + sync de lecturas
  - Validación de schema (>500 lecturas → 400)
  - Rotación de refresh tokens
  - Revocación + verificación de acceso bloqueado
- [x] **`cloud/src/tests/loadTest.ts`** — REESCRITO (el original estaba roto)
  - Flujo completo: login → crear → activar → heartbeat+sync → revocar
  - N agentes concurrentes configurables (`--agents`)
  - Métricas: requests/s, p50/p95/p99, error rate
  - Sale con código 1 si error rate > 5%
- [x] **`agent/src/tests/snmpSimulator.ts`** — Simulador SNMP standalone
  - Simula HP LaserJet Pro M404n / Lexmark MS431dn / Samsung SCX-4623F
  - Puerto 10161 (sin privilegios root)
  - Toner magenta bajo (8%) en perfil HP → genera alerta real
  - `npm run snmp:sim -- --brand hp|lexmark|samsung`
- [x] `scanner.ts` exporta `tonerPct`, `hrStatus` para testing sin SNMP real

### Scripts de prueba

| Comando | Descripción |
|---|---|
| `cd agent && npm test` | Unit tests del agente (scanner + queue) |
| `cd cloud && npm test` | Integration tests del backend (requiere servidor corriendo) |
| `cd cloud && npm run test:load -- --agents 20 --duration 60` | Load test con 20 agentes |
| `cd agent && npm run snmp:sim -- --brand hp` | Simulador HP en puerto 10161 |

### Pruebas de campo (hardware real — pendientes de piloto)

- [ ] Pruebas con impresora HP FutureSmart (OIDs enterprise 11)
- [ ] Pruebas con impresora Lexmark (2015+, enterprise 641)
- [ ] Pruebas con Samsung legacy (enterprise 236)
- [ ] Verificar cola offline: desconectar agente, imprimir 100+ páginas, reconectar → sync automático
- [ ] Verificar backpressure: >10.000 lecturas pendientes → scan omitido

---

## FASE 8 — Producción ❌ PENDIENTE

### Docker Compose (creado en Fase 1) — pendiente de ajustes finales
- [x] Servicios: api, portal, postgres/timescale, redis, nginx
- [ ] Certbot / Let's Encrypt (auto-renovación SSL)
- [ ] Dominio y DNS configurado
- [ ] Variables `.env.production` completas
- [ ] Backup automático PostgreSQL (cron con `pg_dump` a S3)
- [ ] Monitoreo de uptime (UptimeRobot)
- [ ] Log management (PM2 o Logtail)
- [ ] Piloto 2-3 clientes (2 semanas)
- [ ] Documentación de instalación del agente para equipo técnico

---

## Roadmap (del PDF — pendiente de implementar)

| Prioridad | Mejora |
|-----------|--------|
| Alta | Integración con HP SDS API |
| Alta | Exportación automática a ERP (webhook/CSV programado) |
| Media | Soporte SNMPv3 |
| Media | Soporte Xerox y Canon |
| Media | App móvil (React Native) |
| Baja | Machine Learning (predicción reemplazo toner) |
| Baja | White-label del portal |
