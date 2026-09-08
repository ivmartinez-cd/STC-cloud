# Especificación de Requisitos del Sistema - STC Cloud Spec

Este documento técnico interno describe las dependencias de arquitectura, requerimientos de entorno de ejecución, bibliotecas nativas y especificaciones de base de datos requeridas para desplegar de forma segura el ecosistema STC Cloud (Agente local y Servidores backend).

---

## 1. Entorno de Ejecución del Agente Local

El agente de monitoreo es un paquete empaquetado como binario nativo independiente utilizando una arquitectura de Ejecutable Único de Node.js (SEA - Single Executable Application) administrada bajo Windows mediante **NSSM (Non-Sucking Service Manager)**.

### A. Dependencias de Node.js y Compilación
*   **Node.js Runtime:** v24.x o superior LTS (requerido para soporte nativo de API fetch, TLS 1.3 y WebSockets robustos).
*   **Enlace Nativo de SQLite (better-sqlite3):**
    *   El agente utiliza la biblioteca nativa C++ `better-sqlite3` para su cola local.
    *   **Importante:** En entornos de empaquetado (como `pkg` o `SEA`), la biblioteca nativa compilada (`better_sqlite3.node`) se localiza dinámicamente fuera del binario ejecutable principal en el mismo directorio de ejecución para garantizar compatibilidad con arquitecturas de procesador específicas.
    *   **Compilador requerido para instalación:** `node-gyp` junto con las herramientas de compilación de C++ para Windows (VS Build Tools) o Linux (`make`, `g++`).

### B. Dependencias de Bibliotecas del Agente (package.json)
*   `net-snmp` (v3.x.x): Implementación pura de Node.js del protocolo SNMP para consultas asíncronas en puerto 161 UDP.
*   `better-sqlite3` (v11.x.x): Motor de persistencia ultrarrápido y síncrono que bloquea la cola y la administra de forma transaccional.
*   `ws` (v8.x.x): Cliente WebSocket para mantener la conexión bidireccional en tiempo real con el servidor de la nube.

---

## 2. Requisitos de Persistencia Local (SQLite WAL)

La cola del agente local (`local.db`) se gestiona con la siguiente configuración técnica de rendimiento:

### A. Modos PRAGMA de SQLite
*   `PRAGMA journal_mode = WAL;` (Write-Ahead Logging):
    *   Permite que los procesos de lectura (por ejemplo, el hilo de carga de telemetría a la nube) y los procesos de escritura (el hilo del escáner SNMP) se ejecuten en paralelo sin bloquearse mutuamente.
    *   Reduce drásticamente el desgaste del disco duro (I/O overhead) al escribir en un log secuencial `.db-wal` antes de consolidar datos.
*   `PRAGMA synchronous = NORMAL;`
    *   El motor no detiene la ejecución del hilo principal esperando a que los datos se escriban físicamente en los platos del disco en cada transacción, delegándolo al sistema operativo de forma segura. Esto ofrece una velocidad de inserción extrema sin comprometer la integridad ante fallas del agente.

### B. Estructura de Tablas Locales
1.  **`readings_queue`**: Almacena las lecturas pendientes de sincronizar con el portal.
    *   Campos: `id` (Auto-increment), `device_id` (TEXT), `ip` (TEXT), `brand` (TEXT), `model` (TEXT), `time` (TEXT), contadores de página totales, mono y color, niveles de cartuchos de tóner (negro, cian, magenta, amarillo), `poll_method` (TEXT) y bandera de sincronización `synced` (INTEGER).
2.  **`known_devices`**: Registro rápido de dispositivos descubiertos para deduplicar e identificar el método de consulta óptimo (SNMP/EWS/PJL/IPP).
    *   Llave Primaria: `ip` (TEXT).

---

## 3. Infraestructura del Servidor Backend (Cloud)

El backend en la nube es una API REST/WSS de alto rendimiento construida sobre Fastify y orquestada para despliegues escalables.

### A. Dependencias de Middleware y Base de Datos
*   **Runtime:** Node.js v24.x o superior.
*   **Base de Datos Principal:** PostgreSQL 16+ para almacenamiento relacional multi-inquilino.
*   **ORM / Constructor de Consultas:** `Knex.js` administrando migraciones de base de datos en caliente y pools de conexiones optimizados.
*   **Caché y Mensajería:** `Redis` (v7+).
*   **Cola de Tareas en Segundo Plano:** `BullMQ` para encolar alertas, procesamiento asíncrono de lecturas masivas y escalado horizontal de procesamiento de logs.

### B. Esquema de Base de Datos Cloud Relevante (Tablas Principales)

#### Tabla `agents`
*   `id` (UUID, PK)
*   `client_id` (UUID, FK a clientes)
*   `name` (VARCHAR)
*   `status` (VARCHAR - 'pending', 'active', 'offline')
*   `activation_key` (VARCHAR, null tras activación exitosa)
*   `activation_expires_at` (TIMESTAMP, TTL de 24 horas)
*   `refresh_token_hash` (VARCHAR, hash SHA-256 del refresh token rotativo)
*   `hardware_id` (VARCHAR, hash del MachineGuid + BIOS Serial)
*   `ip_ranges` (TEXT, JSON con rangos de escaneo configurados)
*   `snmp_community` (VARCHAR, comunidad SNMP autorizada para la red)
*   `scan_interval_minutes` (INTEGER, intervalo de escaneo)

#### Tabla `devices`
*   `id` (UUID, PK)
*   `agent_id` (UUID, FK a `agents`)
*   `ip_address` (VARCHAR)
*   `serial_number` (VARCHAR)
*   `brand` (VARCHAR)
*   `model` (VARCHAR)
*   `name` (VARCHAR)
*   **Índice de Restricción Única:** `UNIQUE (agent_id, serial_number)` para evitar duplicación de hardware en la misma red de cliente cuando cambia de dirección IP.

---

## 4. Requisitos del Sistema Operativo de Alojamiento (Host)

### A. Agente Local (Windows / Linux)
*   **Windows (Edición recomendada):** Windows Server 2016 / 2019 / 2022 o Windows 10 / 11 (64-bit). El agente se aloja como Servicio de Windows (LocalSystem) a través de NSSM.
*   **Linux (Entorno de desarrollo / Contenedores):** Cualquier distribución basada en Linux kernel 5.x o superior (Ubuntu 22.04 LTS recomendado) con soporte para compilación nativa de Node a través de `musl` o `glibc`.

### B. Servidor Cloud
*   Se despliega mediante **Docker** y **Docker Compose** en servidores Linux (Ubuntu Server) o en plataformas gestionadas basadas en contenedores (AWS ECS, Azure App Services, Render).
