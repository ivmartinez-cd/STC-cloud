# STC Cloud Monitor — Data Collection Inventory
**Versión:** 2.0 | **Fecha:** 2026-08-23 | **Clasificación:** Público / Auditoría IT

---

## 1. Propósito del Documento

Este documento enumera exhaustivamente todos los datos que el agente **STC Cloud Monitor** recopila, almacena y transmite. Su objetivo es facilitar revisiones de privacidad, auditorías de seguridad y cumplimiento con normativas de protección de datos (GDPR, LGPD, leyes locales).

**Conclusión ejecutiva:** El agente recopila exclusivamente métricas operativas de impresoras (contadores de páginas, insumos, modelo, número de serie, y —desde esta versión— dirección MAC y metadatos de firmware/ubicación reportados por el propio equipo). **No recopila, procesa ni transmite ningún dato de usuarios, documentos, credenciales de red ni Información de Identificación Personal (PII).**

> **Cambios relevantes desde v1.5 (2026-05-16):** dirección MAC como identificador secundario; detalle completo de insumos (código/serie/capacidad/páginas impresas/estimadas por cartucho); firmware, hostname y ubicación reportados por el equipo; soporte SNMPv3 con credenciales cifradas at-rest; horario laboral/TZ configurable por agente; rangos de escaneo con CIDR y hostname (point lookup) además de rango manual; **política de retención cloud ahora formalizada** (antes "no especificada"); nueva superficie de datos por **API pública + webhooks de integración ERP** (opt-in, para terceros); nuevo mecanismo de **acceso remoto a la EWS de un dispositivo** (opt-in por agente, auditado, ver §2.6).

---

## 2. Inventario de Datos — Tabla de Diccionario

### 2.1 Datos Recopilados de Dispositivos (vía SNMP y EWS)

| # | Campo | Tipo | Origen | Propósito | Sensibilidad | Transmitido al Servidor |
|---|-------|------|---------|-----------|--------------|------------------------|
| 1 | `ip` | String (IPv4) | Red local — scan TCP/SNMP | Identificar la impresora en la red del cliente | **Media** — IP privada, no ruteable externamente | Sí |
| 2 | `mac` | String (MAC address) | OID SNMP `ifPhysAddress` | Identidad secundaria — corrige duplicados cuando DHCP reasigna la IP | **Media** — identificador de hardware físico | Sí |
| 3 | `brand` | Enum (hp/lexmark/samsung/ricoh/brother/xerox/generic) | OID SNMP `sysObjectID` | Selección de OIDs/driver correctos para la marca | Baja | Sí |
| 4 | `model` | String | OID SNMP `sysDescr` / EWS | Identificación del modelo para reportes | Baja | Sí |
| 5 | `serial` | String | OID específico por marca / EWS | Identificador primario del dispositivo físico (junto con `client_id`) | **Media** — número de serie del fabricante | Sí (como `device_id`) |
| 6 | `firmware` | String | EWS (varía por marca) | Versión de firmware — útil para diagnóstico de compatibilidad (ej. HP FutureSmart 4.5+ Secure by Default) | Baja | Sí |
| 7 | `hostname` | String | EWS/DNS reverso | Nombre de red del equipo, si el firmware lo expone | Baja | Sí |
| 8 | `location_reported` / `sku` | String | EWS (campo de ubicación configurado en el equipo, código de modelo) | Metadatos administrativos ya cargados en el equipo por el cliente | Baja | Sí |
| 9 | `total_pages` / `mono_pages` / `color_pages` | Integer | OID de contador por marca / EWS | Facturación de páginas impresas | Baja | Sí |
| 10 | `toner_black/cyan/magenta/yellow` | Integer (0-100) | OID de tóner / EWS | Nivel de insumo restante | Baja | Sí |
| 11 | `cartridge_code_*` / `cartridge_serial_*` | String | EWS (por marca) | Código de parte y serial CRUM del cartucho — para gestión de reposición | **Media** — identificador de insumo, no de persona | Sí |
| 12 | `cartridge_capacity_*` / `cartridge_printed_*` / `cartridge_estimated_*` | Integer | EWS | Capacidad nominal, páginas ya impresas con ese cartucho, páginas restantes estimadas | Baja | Sí |
| 13 | `supplies_details` | JSON | EWS | Detalle estructurado de bandejas/alertas de insumos que no encaja en columnas fijas | Baja | Sí |
| 14 | `time` | String ISO 8601 | Reloj del sistema (agente) | Timestamp de la lectura | Baja | Sí |

### 2.2 Datos del Payload Transmitido al Servidor

El endpoint receptor es `POST {serverUrl}/api/v1/devices/sync`. El payload es un array de lecturas — cada una contiene los campos listados en §2.1 más `reading_id` (UUID generado localmente para idempotencia ante reintentos, no identifica a ninguna persona) y `offline` (booleano, refleja si el equipo respondió en ese ciclo).

> **Nota de red:** Todas las transmisiones usan HTTPS (TLS 1.2+) con autenticación Bearer JWT (rotación automática con refresh token, ver §2.4). El agente admite proxy corporativo HTTP/HTTPS configurable. El canal de comandos en tiempo real (WSS) usa un **ticket de un solo uso, de 60 segundos de vida**, en vez del JWT de sesión — un ticket capturado en un log de proxy no sirve para nada pasado ese lapso ni reutilizado (reemplazó, en esta pasada, un diseño anterior que exponía el JWT completo por query string).

### 2.3 Datos Almacenados Localmente

**Ubicación:** `C:\ProgramData\STCCloudMonitor\local.db` (SQLite, WAL, sólo accedido por el servicio)

| Tabla | Campos relevantes | Retención | Propósito |
|-------|--------|-----------|-----------|
| `readings_queue` | device_id, ip, brand, model, time, contadores, insumos, `reading_id`, synced, created_at | 7 días (purga automática de filas ya sincronizadas) | Cola de envío con soporte offline |
| `known_devices` | ip, serial, brand, model, registered, poll_method, driver, **`snmp_cred_id`** (qué credencial de la lista sirvió), **`last_reading_snapshot`/`last_reading_sent_at`** (dedupe — sólo se reencola si cambió algo o pasaron 4h) | Indefinida (catálogo de dispositivos) | Evitar re-registro innecesario, negociación SNMP más rápida, y no mandar lecturas idénticas repetidas |

`agent.log` rota en cadena hasta 5 archivos de 10MB (antes: un solo nivel, se pisaba en cada corte) — retención total acotada, nunca crece sin límite.

### 2.4 Configuración Cifrada

**Ubicación:** `C:\ProgramData\STCCloudMonitor\config.enc` (AES-256-GCM, clave ligada al hardware — ver §3 de la Guía de Auditoría IT para el detalle criptográfico completo)

| Campo | Contenido | Sensibilidad | Almacenamiento |
|-------|-----------|--------------|----------------|
| `serverUrl` | URL del portal STC Cloud | Baja | Local cifrado |
| `agentId` | UUID asignado en activación | Baja | Local cifrado |
| `token` / `refreshToken` | JWT de autenticación + refresh token rotativo | **Alta** | Local cifrado |
| `ipRanges` | Rangos IP a escanear — ahora acepta rango manual, **bloque CIDR**, o **hostname puntual** (resuelto localmente por DNS, el cloud nunca ve la resolución), más exclusiones y credenciales SNMP específicas por rango | **Media** — topología de red | Local cifrado (config); el cloud SÍ almacena esta topología para compilarla y reenviarla — ver nota abajo |
| `snmpCredentials` | Lista de hasta 8 credenciales SNMP (v1/v2c/v3, con secretos de autenticación/privacidad) | **Alta** | Cifradas at-rest en el cloud (AES-256-GCM, clave HKDF-SHA256) — nunca en claro en DB ni en logs; sólo se muestra el prefijo/nombre en el portal |
| `businessHours` | Horario laboral + zona horaria configurables por agente (antes hardcodeado a Argentina) | Baja | Local cifrado |
| `proxyUrl` | URL del proxy corporativo (opcional) | **Media** — puede incluir credenciales | Local cifrado |

> **Corrección respecto a v1.5:** la versión anterior de este documento afirmaba "no se envían rangos de escaneo" al cloud. Eso ya no es preciso: `ip_ranges` (incluyendo hostnames puntuales, CIDR y qué credencial usar por rango) se persiste en la base del servidor (columna jsonb en `agents`) para poder compilarlo, validarlo (tope de 2000 IPs declaradas, 32 especificaciones) y reenviarlo al agente en cada heartbeat. Sigue sin transmitirse ningún secreto de red del cliente más allá de la topología de rangos IP que el propio administrador configuró desde el portal.

> **Mecanismo de cifrado:** AES-256-GCM. La clave se deriva con PBKDF2 (SHA-256, 210.000 iteraciones) a partir del Hardware ID del equipo. El Hardware ID nunca se transmite ni almacena en texto claro.

---

## 3. Datos Explícitamente NO Recopilados

Sin cambios respecto a v1.5 — el agente **no recopila** ninguno de los siguientes:

| Categoría | Ejemplos | Confirmación técnica |
|-----------|----------|----------------------|
| PII de usuarios | Nombres, emails, DNI, cuentas de usuario | No existe código de acceso a AD/LDAP/SAM |
| Contenido de documentos | Archivos impresos, texto de documentos | SNMP/EWS sólo exponen contadores e insumos, no spools |
| Capturas de pantalla o actividad de usuario | Actividad en PC, historial de aplicaciones | Agente no tiene acceso a sesiones de usuario |
| Contraseñas de red | Credenciales de dominio, WiFi, aplicaciones | No hay acceso a credential manager (las credenciales SNMP configuradas por el admin SÍ se cifran at-rest, ver §2.4 — son de la impresora, no de la red corporativa) |
| Inventario de software | Aplicaciones instaladas en el equipo host | Solo accede a Registry para MachineGuid |
| Tráfico de red | Contenido de paquetes, DNS queries | Sólo genera tráfico SNMP/HTTP saliente hacia impresoras en los rangos configurados |

---

## 4. Flujo de Datos (Data Flow Diagram)

```
Impresoras en red local
(SNMP UDP 161, EWS TCP 80/443, PJL TCP 9100, IPP TCP 631)
        │
        ▼
[STC Cloud Monitor Agent]  ←── lectura, sin escritura (GET/SNMP-read únicamente)
 C:\ProgramData\STCCloudMonitor\
 ├── local.db (SQLite, retención 7 días de cola + catálogo indefinido)
 ├── config.enc (AES-256-GCM, ligado al hardware)
 └── agent.log (rotación en cadena, 5 archivos × 10MB)
        │
        │ HTTPS POST /api/v1/devices/sync (Bearer JWT, rotación automática)
        │ WSS con ticket de un solo uso para comandos en tiempo real
        ▼
[STC Cloud — Postgres/TimescaleDB]
 ├── readings (hypertable, retención 2 años, agregados diario/mensual sin vencimiento)
 ├── devices, agents, clients, alerts, audit_logs
 └── agent_logs (retención 90 días) — sólo diagnóstico operacional del agente, no del cliente
```

**Datos que ENTRAN al agente:** Respuestas SNMP/EWS de impresoras (contadores, insumos y metadatos de dispositivo).
**Datos que SALEN del agente:** Lo anterior + identificadores de impresoras → servidor STC Cloud.
**Datos que NUNCA salen:** Hardware ID, JWT/refresh token en claro, credenciales SNMP en claro, topología completa de la red del cliente más allá de los rangos que el propio administrador declaró.

### 4.1 Nuevos flujos de datos opt-in (Fase 2)

Dos capacidades nuevas, **ambas desactivadas por defecto**, que un administrador debe habilitar explícitamente por agente/cliente:

- **API pública + webhooks de integración ERP** (`api_keys`, `api_webhooks`): un cliente puede generar una API key para que su propio sistema (ERP, facturación) consulte lecturas/alertas/cierres vía REST, y/o registrar una URL propia para recibir webhooks de esos mismos eventos. La API key se muestra en claro **una sola vez** al crearla (se guarda sólo su hash SHA-256); el webhook se firma con HMAC-SHA256 para que el receptor verifique autenticidad. Esta es la única vía por la que datos de STC Cloud viajan hacia un **tercero fuera de STC** — queda enteramente bajo control del cliente (quién crea la key, a qué URL apunta el webhook).
- **Acceso remoto a la EWS de un dispositivo** (`agents.remote_ews_enabled`): permite que un operador de STC, desde el portal, pida ver una página específica de la interfaz web de una impresora del cliente, sin necesidad de VPN. Es un proxy de un único GET por vez (no una sesión de túnel abierta), con allowlist en dos capas (el cloud sólo permite IPs de dispositivos ya sincronizados de ese agente, el agente vuelve a validar contra su catálogo local antes de conectar), auditado en `audit_logs` (qué ruta se pidió, nunca el contenido de la respuesta), y limitado a 2MB por respuesta. **Desactivado por defecto** — requiere que un administrador lo habilite explícitamente por agente, igual que HP SDS con su función equivalente.

---

## 5. Clasificación de Riesgo de Privacidad

| Riesgo | Nivel | Justificación |
|--------|-------|---------------|
| Exposición de PII | **Ninguno** | El agente no accede ni procesa datos de personas |
| Exposición de datos de negocio sensibles | **Bajo** | Contadores, insumos y metadatos de equipo — nada de contenido de negocio |
| Exposición de topología de red | **Bajo-Medio** | Los rangos de escaneo (incl. CIDR/hostnames) ahora SÍ se guardan cloud-side para poder compilarlos — ver corrección en §2.4. Las IPs son internas, no ruteables externamente |
| Credenciales comprometidas | **Bajo** | JWT/refresh cifrados at-rest y rotativos; comandos en tiempo real usan un ticket de 60s de un solo uso (ya no el JWT de sesión); credenciales SNMP cifradas con AES-256-GCM/HKDF-SHA256, nunca en claro en DB ni logs |
| Acceso a red interna vía Remote EWS | **Bajo, mitigado** | Opt-in por agente, allowlist en dos capas, sólo GET, auditado, tope de tamaño de respuesta — ver §4.1 |
| Pérdida de datos | **Bajo** | Retención local acotada (7 días de cola); retención cloud ahora formalizada: `readings` 2 años, `agent_logs` 90 días, alertas resueltas 12 meses (ver §6) |

---

## 6. Política de Retención (formalizada — antes "no especificada")

| Dato | Ventana | Mecanismo |
|------|---------|-----------|
| `readings` (contadores crudos, cloud) | **24 meses** | `add_retention_policy` nativo de TimescaleDB |
| Agregados diario/mensual (`readings_daily_agg`/`readings_monthly_agg`) | **Sin vencimiento** | Sobreviven a la purga de `readings` crudo — son datos ya materializados |
| `agent_logs` (logs operacionales del agente, cloud) | **90 días** | Job de purga periódico |
| `alerts` resueltas | **12 meses** (las abiertas nunca se purgan) | Job de purga periódico |
| `audit_logs` (trail de auditoría) | **Sin purga automática** | Decisión de negocio explícita — un trail de auditoría no debe autopurgarse; es write-only, ningún endpoint lo lee de vuelta |
| `readings_queue` local (agente) | 7 días | Purga automática, sin cambios respecto a v1.5 |
| `known_devices` local (agente) | Indefinida (catálogo) | Sin cambios respecto a v1.5 |

Estas ventanas son una **decisión de negocio**, no una obligación legal específica documentada — no hay ningún requisito regulatorio que fije un número exacto para este tipo de dato operativo.

---

## 7. Contacto y Responsabilidad

| Rol | Responsabilidad |
|-----|-----------------|
| **Proveedor (STC)** | Custodio de los datos transmitidos al portal; responsable de su almacenamiento y procesamiento; aplica la política de retención de §6 |
| **Cliente (IT Admin)** | Define rangos IP de escaneo; decide si habilita API pública/webhooks y Remote EWS (ambos opt-in); propietario del equipo host del agente |
| **Auditor de privacidad** | Puede solicitar logs de auditoría (`audit_logs` en el servidor, o `C:\ProgramData\STCCloudMonitor\agent.log` local) |

---

*Documento generado a partir del análisis del código fuente de STC Cloud Monitor v2.0 (agosto 2026). Para revisiones o consultas, contactar al equipo de seguridad de STC.*
