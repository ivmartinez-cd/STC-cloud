# 🗺️ Mapa de Código (Code Map) - Ecosistema STC Cloud

Este documento proporciona una guía de navegación estructural sobre el repositorio de **STC Cloud** para facilitar la auditoría manual por parte del equipo de sistemas. Se detalla la función exacta de cada directorio y archivo principal, demostrando una separación limpia de responsabilidades (Decoupled Clean Architecture).

---

## 🏗️ Estructura General del Proyecto

El repositorio está dividido en carpetas independientes para el **Servidor Cloud**, el **Agente de Recolección (DCA)**, la **Interfaz de Monitoreo**, y los recursos de empaquetado/despliegue:

```
STC-cloud/
├── agent/               # Agente Local DCA (NodeJS compilado a SEA síncrono)
├── cloud/               # Servidor Backend (Fastify API) y Portal Web (React)
│   ├── portal/          # Frontend Web del Portal (Vite + React)
│   └── src/             # Backend API y Servicios de Negocio (Fastify)
├── bridge/              # Interfaz o puente de comunicación entre componentes
├── shared/              # Modelos de datos y tipos compartidos TypeScript
├── docs/                # Documentación técnica, manuales e informes de auditoría
└── docker-compose.yml   # Orquestación local/producción con contenedores
```

---

## 📡 1. Agente Local (`/agent`)

El agente de recolección (DCA) es un binario independiente de cero-configuración que se ejecuta en la intranet del cliente.

```
agent/src/
├── core/
│   ├── main.ts            # Punto de entrada inicial y loop de ejecución
│   ├── ConfigManager.ts   # Carga y descifrado de credenciales (AES-256-GCM + HWID)
│   ├── ConsoleEngine.ts   # CLI interactiva de diagnóstico local
│   └── SocketManager.ts   # Gestión de WebSockets seguros (WSS) bidireccionales
├── capture/               # Motor de captura por modelo (ver capture/README.md)
│   ├── index.ts           # captureDevice(): puertos → identidad → driver → scopes → normalización
│   ├── registry.ts        # Familias + perfiles; resolve()
│   ├── families/          # Lógica de protocolo por firmware (hp.devmgmt, samsung.syncthru, samsung.sws, lexmark.cgi, generic.printer-mib, ...)
│   ├── models/<marca>/    # Un archivo declarativo por modelo de impresora (defineModel)
│   ├── transport/         # fetchHttp (EWS) y SnmpClient (GET por lotes, GETBULK)
│   └── normalize.ts       # CaptureResult → DeviceReading (contrato del servidor)
├── snmp/
│   ├── scanner.ts         # Fachada de compatibilidad sobre capture/ (readDevice, readViaSNMP, ...)
│   ├── ews.ts             # Lista de endpoints EWS genéricos (familia generic.ews)
│   ├── ews-parsers/       # Parsers HTML/JSON/XML por marca reutilizados por las familias
│   └── oids.ts            # Diccionario de OIDs SNMP por marca (HP, Lexmark, Samsung, Ricoh, Brother, Xerox)
├── sync/
│   ├── database.ts        # Cliente local SQLite de alto rendimiento (PRAGMA WAL)
│   └── synchronizer.ts    # Transmisión y encolado tolerante a fallos WAN (Backpressure)
├── install/
│   └── service.ts         # Registro y control del agente como Servicio de Windows
└── types/
    └── index.ts           # Definiciones de tipo para telemetría e inventario
```

### 🎯 Garantía de Separación:
* **Capa de Captura (`capture/` + `snmp/`):** El código que dialoga directamente con los fierros (impresoras) mediante SNMP, PJL, IPP o HTTP está encapsulado aquí: `capture/` decide *qué* leer de cada modelo (perfiles y familias) y `snmp/` aporta parsers y OIDs. No contiene lógica de negocio del servidor.
* **Capa de Almacenamiento (`sync/`):** Resguarda y encola lecturas en SQLite. El motor de sincronización (`synchronizer.ts`) se limita a empujar datos cifrados y purgar la cola cuando el servidor confirma la recepción.
* **Capa de Seguridad (`core/ConfigManager.ts`):** Aislado del resto de rutinas. Único módulo autorizado para derivar llaves PBKDF2 y descifrar la configuración local.

---

## ☁️ 2. Servidor Backend (`/cloud`)

El backend de la nube está estructurado bajo el patrón **Controller-Service-Repository**, garantizando que el procesamiento HTTP sea independiente de la base de datos y la lógica comercial.

```
cloud/src/
├── api/
│   ├── server.ts          # Inicializador de Fastify, plugins y middlewares de seguridad
│   ├── routes/            # Definición de rutas REST y esquemas de validación (Joi/Schema)
│   │   ├── auth.ts        # Endpoints de login y refresco de tokens
│   │   ├── agents.ts      # Endpoints para comandos y registros DCA
│   │   └── portal.ts      # API privada para la gestión web
│   ├── controllers/       # Extracción de parámetros HTTP y mapeo de respuestas
│   ├── middlewares/       # Validadores de tokens JWT (portalAuth y agentAuth)
│   └── utils/             # Funciones criptográficas y formateadores comunes
├── services/
│   ├── agentService.ts    # Lógica de registro, control de latidos (Heartbeats) de agentes
│   ├── deviceService.ts   # Coalescencia e inserciones transaccionales de impresoras
│   └── auditService.ts    # Registro inmutable de auditoría en la tabla `audit_logs`
├── db/
│   ├── knex.ts            # Conexión principal parametrizada con Knex.js
│   ├── migrations/        # Scripts estructurados SQL de migración en caliente
│   └── seeds/             # Datos de prueba controlados
└── ws/
    └── server.ts          # Gateway WebSocket receptor de canales activos de agentes
```

### 🎯 Garantía de Separación:
* **Rutas e Inyección de Esquemas (`api/routes/`):** Utilizan esquemas de validación estrictos en Fastify. Ningún payload de datos ingresa a la lógica interna si no coincide exactamente con el tipo de datos declarado.
* **Servicios de Negocio (`services/`):** No contienen código relacionado con HTTP, cabeceras, ni cookies. Son clases puras de TypeScript que procesan lógica dura y llaman a Knex para persistencia.
* **Middlewares (`api/middlewares/`):** Centralizan el control de acceso corporativo (RBAC), impidiendo que un agente interactúe con el portal y viceversa.

---

## 📊 3. Portal Frontend (`/cloud/portal`)

Aplicación moderna construida con Vite, React y TypeScript, estructurada para ser auto-explicativa:

```
cloud/portal/src/
├── components/            # Componentes visuales atómicos reutilizables (FeedbackModal, etc.)
├── hooks/                 # Controladores de estado dinámico y llamadas API centralizadas
├── pages/                 # Páginas de la interfaz (Dashboard, Agentes, Impresoras)
├── context/               # Proveedores de estado global (Autenticación, Sesión, Preferencias)
├── utils/                 # Formateadores numéricos y helpers visuales
└── main.tsx               # Punto de entrada de la UI
```

---

## 📜 4. Documentación de Auditoría (`/docs`)

Para facilitar el análisis técnico inmediato, se han consolidado múltiples informes de auditoría:
*   [Guía Técnica de Arquitectura](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/STC_Technical_Architecture_Guide.md) - Protocolos de red, flujo SNMP/EWS, Hardware Binding.
*   [Informe de Auditoría de Código](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/STC_Codebase_Audit_Report.md) - Hallazgos técnicos y mitigaciones aplicadas.
*   [Informe de Seguridad y Hardening](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/SECURITY_AUDIT.md) - Rate limit, JWT de dos capas, protección contra inyecciones SQL/Command.
*   [Métodos de Extracción de Contadores](file:///j:/Dev/Trabajo/STCcloud/STC-cloud/docs/dev/PRINTER_COUNTER_METHODS.md) - Análisis técnico de la cascada de recolección local.
