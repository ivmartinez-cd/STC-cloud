# 🗺️ Mapa de Código (Code Map) - Ecosistema STC Cloud

Este documento es una guía de navegación estructural del repositorio de **STC Cloud**: qué hay en cada directorio y dónde vive cada responsabilidad. Sirve tanto para orientar a un desarrollador nuevo como para auditoría técnica.

> El estándar de arquitectura vigente para código nuevo es [`ARCHITECTURE_GUIDE.md`](./ARCHITECTURE_GUIDE.md); este mapa describe el estado real del árbol, incluidas las zonas que todavía no terminaron de migrar a ese estándar.

---

## 🏗️ Estructura General del Proyecto

```
STC-cloud/
├── agent/               # Agente Local DCA (Node.js compilado a ejecutable único)
├── cloud/               # Backend (Fastify API) y Portal Web (React)
│   ├── src/             # Backend API, módulos de negocio y jobs
│   ├── portal/          # Frontend del Portal (Vite + React 19)
│   ├── scripts/         # Guardas de arquitectura y runner de tests de CI
│   └── docker/          # Dockerfiles e imagen de despliegue
├── monitor-ui/          # Tray app local de Windows (.NET 9 WinForms)
├── installer/           # Empaquetado del agente (Inno Setup) y firma de bundles
├── prometheus/          # Config y reglas de alerta (perfil `observability`)
├── grafana/             # Datasource y dashboards auto-provisionados
├── alertmanager/        # Ruteo de alertas (perfil `observability`)
├── docs/                # Documentación técnica, manuales e informes
├── bridge/              # Código huérfano de una feature anterior; ningún build lo referencia
├── shared/              # Tipos y utilidades de cripto; sin package.json propio, no integrado a los builds
├── docker-compose.yml       # Stack de desarrollo local
└── docker-compose.prod.yml  # Stack de producción (incluye perfil opcional `observability`)
```

---

## 📡 1. Agente Local (`/agent`)

Binario independiente que corre como servicio de Windows en la intranet del cliente.

```
agent/src/
├── core/
│   ├── main.ts             # Punto de entrada; orquesta arranque y loops
│   ├── config.ts           # Carga y descifrado de configuración (config.enc)
│   ├── security.ts         # HWID binding: SHA-256 + PBKDF2 (210.000 iter) + AES-256-GCM
│   ├── ScanService.ts      # Loop de escaneo; delega la lectura en capture/
│   ├── SyncService.ts      # Loop de sincronización con la nube
│   ├── HeartbeatService.ts # Latido periódico hacia el portal
│   ├── SocketManager.ts    # WebSocket seguro (WSS) bidireccional, ping/pong y backoff con jitter
│   ├── CommandHandler.ts   # Ejecución de comandos remotos recibidos por WS
│   ├── TaskScheduler.ts    # Programación de los loops
│   ├── BusinessHours.ts    # Cadencia adaptativa según horario laboral del sitio
│   ├── TimeZoneUtils.ts    # Resolución de zona horaria IANA
│   ├── devicePolicy.ts     # Reglas de qué dispositivos se reportan
│   ├── UpdateService.ts    # Auto-actualización con verificación de firma
│   ├── updateKey.ts        # Clave pública Ed25519 embebida para validar updates
│   ├── CliCommands.ts      # Flags de CLI (--activate, --status, --set-proxy, ...)
│   ├── ConsoleEngine.ts    # Consola de diagnóstico local
│   ├── ConsoleConnector.ts # Puente de la consola con el portal
│   ├── LogTailer.ts        # Lectura incremental de logs para envío
│   ├── NetworkUtils.ts     # Utilidades de red
│   ├── Logger.ts           # Logging estructurado
│   └── version.ts          # Versión del agente
├── capture/                # ⭐ Motor de captura actual (ver capture/README.md)
│   ├── index.ts            # captureDevice(): puertos → identidad → driver → scopes → normalización
│   ├── registry.ts         # Registro de familias y perfiles; resolve()
│   ├── families/           # Lógica por firmware: hp-devmgmt, hp-futuresmart, hp-jetdirect-legacy,
│   │                       #   samsung-syncthru, samsung-sws, lexmark-cgi, generic-ews, generic-printer-mib
│   ├── models/<marca>/     # Un archivo declarativo por modelo (hp/, lexmark/, samsung/)
│   ├── transport/          # http.ts (EWS) y snmp.ts (v1/v2c/v3, GETBULK, lista de credenciales)
│   ├── normalize.ts        # CaptureResult → DeviceReading (contrato del servidor)
│   ├── reading.ts          # Modelo de lectura
│   ├── supplyOrigin.ts     # Origen/identidad de consumibles
│   ├── types.ts            # Tipos del motor de captura
│   └── bridge.ts           # Puente con el código legacy de snmp/
├── snmp/                   # Protocolos y parsers; legacy salvo lo que usa capture/
│   ├── scanner.ts          # Fachada de compatibilidad sobre capture/ (readDevice, readViaSNMP, ...)
│   ├── ews.ts              # Endpoints EWS genéricos (usados por la familia generic-ews)
│   ├── ews-parsers/        # Parsers HTML/JSON/XML por marca, reutilizados por las familias
│   ├── oids.ts             # Diccionario de OIDs por marca
│   ├── pjl.ts / ipp.ts     # Protocolos de fallback (TCP 9100 / 631)
│   ├── printerReset.ts     # Reset remoto de impresora
│   └── probeEndpoints.ts / testEws.ts / testSingleIp.ts  # Herramientas de diagnóstico
├── sync/
│   ├── database.ts         # SQLite local en modo WAL: cola de lecturas + caché de dispositivos
│   └── uploader.ts         # Envío por lotes al portal, con backpressure y purga
├── install/
│   ├── install.js          # Registro como servicio de Windows
│   └── uninstall.js        # Desinstalación
└── types/
    └── net-snmp.d.ts       # Tipos para la librería net-snmp
```

### 🎯 Garantía de Separación
* **Captura (`capture/`):** único lugar que dialoga con las impresoras. Decide *qué* leer de cada modelo (perfiles, familias) y cómo transportarlo (SNMP/HTTP). `snmp/` aporta parsers, OIDs y protocolos de fallback.
* **Persistencia (`sync/`):** encola en SQLite y empuja a la nube; no conoce protocolos de impresora.
* **Seguridad (`core/security.ts` + `core/config.ts`):** único módulo autorizado a derivar claves y descifrar la configuración local.

---

## ☁️ 2. Backend (`/cloud/src`)

Organizado en **módulos hexagonales** (`modules/`), con las capas y la regla de dependencias descriptas en `ARCHITECTURE_GUIDE.md` §3.

```
cloud/src/
├── api/                    # Composición HTTP (no lógica de negocio)
│   ├── server.ts           # Entrypoint: Fastify, Knex, Redis, arranque y shutdown
│   ├── bootstrap.ts        # Migraciones al arrancar y admin por defecto
│   ├── lifecycle.ts        # Ciclo de vida del proceso
│   ├── plugins.ts          # CORS, helmet/CSP, rate limit, colas
│   ├── routes.ts           # registerAllRoutes(): monta las rutas de cada módulo
│   ├── health.ts           # /api/v1/health
│   ├── middlewares/
│   │   └── authMiddleware.ts  # portalAuth / agentAuth / apiKeyAuth + ownership de :id
│   ├── policy/
│   │   └── rolePolicy.ts      # RBAC: CLIENT_VIEWER_ROUTES / ADMIN_ONLY_ROUTES
│   ├── utils/              # deviceFilters.ts, ip.ts, scope.ts
│   ├── routes/             # (vacío — las rutas viven en modules/<x>/presentation/)
│   └── controllers/        # (vacío — los controllers viven en modules/<x>/presentation/)
├── modules/                # ⭐ 24 módulos de negocio, uno por dominio
│   │                       #   activity-views, agents, alerts, audit, auth, clients, dashboard,
│   │                       #   device-costs, devices, email-log, feedback, incidents, inventory,
│   │                       #   message-templates, metrics, observability, public-api, remote-actions,
│   │                       #   reports, scheduled-reports, supplies, supply-requests,
│   │                       #   system-settings, two-factor
│   └── <módulo>/
│       ├── index.ts            # Superficie pública del módulo (ej. registerAuthRoutes)
│       ├── domain/             # Entidades, servicios puros, errores, interfaces de repositorio
│       ├── application/        # Casos de uso, DTOs y puertos
│       ├── infrastructure/     # Adapters concretos: database/ (Knex), queue/, redis/
│       └── presentation/       # Controllers, definición de rutas y wiring
├── jobs/                   # 11 procesos en segundo plano (corren dentro del proceso api)
│   ├── alertWorker.ts          # BullMQ: procesa alertas
│   ├── incidentWorker.ts       # Agrupa alertas en incidentes
│   ├── heartbeatMonitor.ts     # Detecta agentes caídos
│   ├── notificationWorker.ts   # BullMQ: emails y webhooks de notificación
│   ├── publicWebhookWorker.ts  # BullMQ: webhooks salientes hacia ERPs
│   ├── remoteActionWorker.ts   # Despacha acciones remotas hacia agentes
│   ├── reportDeliveryWorker.ts # BullMQ: genera y entrega reportes (email/webhook/SFTP)
│   ├── scheduledReportsWorker.ts # Dispara reportes programados
│   ├── supplyRequestWorker.ts  # Genera pedidos de consumibles
│   ├── retentionJob.ts         # Purga logs y alertas resueltas
│   └── alertDigestJob.ts       # Resumen periódico de alertas
├── services/               # Servicios transversales a varios módulos
│   ├── auditService.ts         # Punto único de escritura a `audit_logs`
│   ├── cryptoService.ts        # Cifrado at-rest (AES-256-GCM) de credenciales de terceros
│   ├── snmpCredentials.ts      # Lista de credenciales SNMP por agente (cifradas)
│   ├── apiKeyService.ts        # API keys de integración ERP (hash SHA-256 at-rest)
│   ├── publicWebhookService.ts # Webhooks salientes de la API pública (HMAC-SHA256)
│   ├── notificationService/    # mailer, webhook y notificaciones por dominio
│   ├── ewsProxyService.ts      # Comandos EWS "síncronos" sobre el WS asíncrono del agente
│   ├── ewsGatewayService.ts    # Sesiones del gateway de EWS navegable (Redis: ticket, cookie jar del equipo, índice por monitor)
│   ├── wsTicketService.ts      # Tickets WS de un solo uso (TTL 60s)
│   ├── sftpDeliveryService.ts / sftpDestination.ts  # Entrega de reportes por SFTP
│   └── supplyOrigin.ts         # Origen de consumibles
├── shared/domain/          # Lógica de dominio compartida entre módulos
│   ├── ip-range-spec/          # Validación de rangos IP (CIDR + exclusiones) y compilación
│   ├── business-hours.ts       # Horario laboral y zona horaria por agente
│   ├── snmp-credential.ts      # Modelo de credencial SNMP
│   ├── sftp-destination.ts     # Modelo de destino SFTP
│   ├── audit-action-catalog.ts # Catálogo de acciones auditables
│   └── errors/                 # Jerarquía AppError/DomainError/ApplicationError/InfrastructureError
├── ws/                     # WebSocket (agentes + portal) en /ws
│   ├── index.ts                # Registro del endpoint
│   ├── handshake.ts            # Autenticación y clasificación de la conexión
│   ├── redis-channels.ts       # Pub/sub para escalar entre réplicas
│   └── state.ts                # Mapas de conexiones activas
├── db/
│   ├── knexfile.ts             # Configuración de Knex (Postgres + TimescaleDB); pool por env
│   ├── migrations/             # 75 migraciones versionadas
│   ├── seeds/ y manual_seed.ts # Datos de prueba
│   └── test_db.ts              # Utilidades de base para tests
├── tests/                  # Suite de integración (65 archivos .test.ts)
├── logger.ts               # Logging (pino)
└── version.ts              # Versión del backend
```

### 🎯 Garantía de Separación
* **`api/` sólo compone:** arranque, plugins, autenticación y montaje de rutas. La lógica vive en `modules/`.
* **`modules/<x>/domain/` no importa infraestructura:** la regla de dependencias está enforced en CI por `cloud/scripts/check-guards.mjs`.
* **Autorización centralizada:** `authMiddleware.ts` (tipo de credencial + ownership) y `rolePolicy.ts` (rol), verificados por `cloud/scripts/check-routes.mjs` — ver [ADR-004](../adr/004-modelo-de-autorizacion.md) y [PERMISSIONS_CATALOG.md](./PERMISSIONS_CATALOG.md).

---

## 📊 3. Portal Frontend (`/cloud/portal`)

SPA en React 19 + TypeScript sobre Vite, con Tailwind CSS 4. Organizada **por feature**, no por tipo de archivo.

```
cloud/portal/src/
├── main.tsx                # Punto de entrada
├── App.tsx                 # Router: rutas lazy, RequireAuth y RequireRole
├── app/layout/             # Shell de la aplicación
│   ├── Layout.tsx              # Estructura general (sidebar + contenido)
│   ├── SidebarNav.tsx / navItems.ts / navTree.ts  # Navegación y gateo por rol
│   ├── useNavBadges.ts         # Contadores en el menú
│   ├── GlobalSearch.tsx / useGlobalSearch.ts      # Búsqueda global
│   └── FeedbackButton.tsx      # Acceso a feedback (cabecera)
├── features/<dominio>/     # 13 features autocontenidas, cada una con pages/, components/, hooks/
│   │                       #   activity, alerts, auth, clients, dashboard, devices, email-log,
│   │                       #   incidents, monitors, pending-devices, reports, settings, supplies
├── shared/                 # Transversal a features
│   ├── lib/                    # Cliente HTTP (fetch + CSRF + manejo de 401/403), formatters
│   ├── components/             # UI reutilizable
│   ├── hooks/                  # Hooks compartidos (ej. polling de recursos)
│   └── types/                  # Tipos de dominio compartidos
├── store/                  # Estado global (sólo dos contextos)
│   ├── AuthContext.tsx         # Sesión del usuario
│   └── ToastContext.tsx        # Notificaciones
└── assets/
```

### 🎯 Garantía de Separación
* **Una feature no importa de otra feature**, y `shared/`/`store/`/`app/` no importan de `features/` — regla verificada en CI por `check-guards.mjs`.
* **Sesión sin token en JavaScript:** la autenticación viaja en cookie httpOnly; el cliente HTTP de `shared/lib/` agrega el header anti-CSRF en cada mutación.

---

## 🔍 4. Guardas de Arquitectura (`/cloud/scripts`)

Scripts que corren en CI y bloquean el merge si se viola una regla:

| Script | Qué garantiza |
| :--- | :--- |
| `check-routes.mjs` | Toda ruta declara autenticación, salvo allowlist pública explícita. Con `--write-catalog` regenera `PERMISSIONS_CATALOG.md`. |
| `check-guards.mjs` | Fronteras de dependencia entre capas y entre features; prohíbe logs de depuración y SQL interpolado. |
| `check-sizes.mjs` | Límite de tamaño por archivo y por función (ratchet con baseline). |
| `ci-test-runner.mjs` | Runner de la suite de integración. |

---

## 📜 5. Documentación de Referencia (`/docs`)

* [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) — Estándar de arquitectura y convenciones vigente.
* [STC_Technical_Architecture_Guide.md](./STC_Technical_Architecture_Guide.md) — Arquitectura profunda del motor de captura del agente.
* [STC_Capture_Drivers_Master_Prompt.md](./STC_Capture_Drivers_Master_Prompt.md) — Documento rector para agregar modelos de impresora nuevos.
* [PERMISSIONS_CATALOG.md](./PERMISSIONS_CATALOG.md) — Quién puede llamar cada ruta (auto-generado).
* [../adr/](../adr/) — Architecture Decision Records.
* [../api/openapi.yaml](../api/openapi.yaml) — Especificación de la API pública.
* [../../SECURITY_AUDIT.md](../../SECURITY_AUDIT.md) — Hardening y ciberseguridad del backend.
