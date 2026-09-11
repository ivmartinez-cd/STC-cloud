# STC Cloud Monitor — Data Collection Inventory
**Versión:** 2.2 | **Fecha:** 2026-09-11 | **Clasificación:** Público / Auditoría IT

---

## 1. Propósito del Documento

Este documento enumera exhaustivamente todos los datos que **el agente STC Cloud Monitor y el portal STC Cloud** recopilan, almacenan y transmiten. Su objetivo es facilitar revisiones de privacidad, auditorías de seguridad y cumplimiento con normativas de protección de datos (GDPR, LGPD, leyes locales).

**Conclusión ejecutiva:** El **agente** (el software que corre en la red del cliente y habla con las impresoras) recopila exclusivamente métricas operativas de dispositivos (contadores de páginas, insumos, modelo, número de serie, dirección MAC y metadatos de firmware/ubicación reportados por el propio equipo). **No recopila, procesa ni transmite ningún dato de usuarios finales, documentos impresos, ni credenciales de red del cliente.**

Distinto es el **portal** (la aplicación web que usan los administradores del cliente para operar STC Cloud): sí procesa un conjunto acotado de datos personales de **personas identificadas que son parte del equipo de IT/operaciones del cliente** — nunca de los usuarios finales que imprimen. Ver el §2.5 (agregado en la v2.1) para el detalle completo: cuentas de operador del portal (usuario, rol, 2FA), un registro de auditoría de logins (usuario + IP, sin purga automática — ver §6), y las direcciones de email que el propio cliente configura como destinatarias de sus reportes/alertas. Esto es una corrección respecto a la conclusión de v2.0, que declaraba cero PII sin distinguir agente de portal — ver el detalle de qué cambió abajo.

> **Cambios relevantes desde v2.1 (2026-08-25):** sin datos nuevos de dispositivo ni PII nueva — cambia el VOLUMEN de topología de red que el cloud almacena y un campo de configuración. Los topes por agente de `ip_ranges` pasaron de 2.000 IPs declaradas / 32 especificaciones a **65.536 IPs declaradas, 256 rangos manuales o CIDR y 32 hostnames** (pools separados), para cubrir clientes multi-sede reales; y cada entrada admite un **flag de habilitado** que se guarda en el cloud pero no se le reenvía nunca al agente. Ver §2.4 y la nota de corrección respecto a v1.5.
>
> **Cambios relevantes desde v2.0 (2026-08-23):** nuevo §2.5 — **cuentas de operador del portal + 2FA TOTP** (secreto cifrado at-rest, códigos de recuperación hasheados SHA-256); **auditoría de logins** (usuario + IP + resultado en cada intento, sin purga — la falla más ruidosa de v2.0 era no distinguir esto de la telemetría de impresoras); **direcciones de email de destinatarios** de reportes programados (`scheduled_reports.recipients`) y su bitácora de entrega (`email_log.recipient`) — ambas son PII (identifican a una persona del cliente), antes no mencionadas en absoluto; nueva capacidad de **acciones remotas en bloque** sobre agentes/equipos, incluido reinicio remoto de impresora vía SNMP SET (auditado, mismo pool de credenciales de lectura, nunca una credencial de escritura separada); módulo de **incidentes** (unidad de trabajo de servicio sobre alertas — sin datos nuevos de dispositivo, sólo metadatos de gestión: asignado a, comentarios de texto libre que un operador del cliente puede escribir).
>
> **Cambios relevantes desde v1.5 (2026-05-16):** dirección MAC como identificador secundario; detalle completo de insumos (código/serie/capacidad/páginas impresas/estimadas por cartucho); firmware, hostname y ubicación reportados por el equipo; soporte SNMPv3 con credenciales cifradas at-rest; horario laboral/TZ configurable por agente; rangos de escaneo con CIDR y hostname (point lookup) además de rango manual; **política de retención cloud ahora formalizada** (antes "no especificada"); nueva superficie de datos por **API pública + webhooks de integración ERP** (opt-in, para terceros); nuevo mecanismo de **acceso remoto a la EWS de un dispositivo** (opt-in por agente, auditado, ver §4.1).

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
| `ipRanges` | Rangos IP a escanear — ahora acepta rango manual, **bloque CIDR**, o **hostname puntual** (resuelto localmente por DNS, el cloud nunca ve la resolución), más exclusiones, credenciales SNMP específicas por rango y un **flag de habilitado por rango** (un rango apagado queda guardado en el cloud pero no se le reenvía nunca al agente) | **Media** — topología de red | Local cifrado (config); el cloud SÍ almacena esta topología para compilarla y reenviarla — ver nota abajo |
| `snmpCredentials` | Lista de hasta 8 credenciales SNMP (v1/v2c/v3, con secretos de autenticación/privacidad) | **Alta** | Cifradas at-rest en el cloud (AES-256-GCM, clave HKDF-SHA256) — nunca en claro en DB ni en logs; sólo se muestra el prefijo/nombre en el portal |
| `businessHours` | Horario laboral + zona horaria configurables por agente (antes hardcodeado a Argentina) | Baja | Local cifrado |
| `proxyUrl` | URL del proxy corporativo (opcional) | **Media** — puede incluir credenciales | Local cifrado |

> **Corrección respecto a v1.5:** la versión anterior de este documento afirmaba "no se envían rangos de escaneo" al cloud. Eso ya no es preciso: `ip_ranges` (incluyendo hostnames puntuales, CIDR y qué credencial usar por rango) se persiste en la base del servidor (columna jsonb en `agents`) para poder compilarlo, validarlo (topes por agente: 65.536 IPs declaradas, 256 rangos manuales o CIDR y 32 hostnames, estos últimos en un pool aparte) y reenviarlo al agente en cada heartbeat. Sigue sin transmitirse ningún secreto de red del cliente más allá de la topología de rangos IP que el propio administrador configuró desde el portal.

> **Mecanismo de cifrado:** AES-256-GCM. La clave se deriva con PBKDF2 (SHA-256, 210.000 iteraciones) a partir del Hardware ID del equipo. El Hardware ID nunca se transmite ni almacena en texto claro.

### 2.5 Datos del Portal (nuevo en v2.1) — personas del equipo de IT del cliente, no usuarios finales

Todo lo de §2.1-2.4 es sobre el **agente** hablando con impresoras — cero personas involucradas. El **portal** (la webapp que usan los administradores/operadores del cliente para gestionar STC Cloud) sí procesa datos de un conjunto acotado de **personas identificadas**: quienes tienen una cuenta de operador en el portal, y quienes el cliente configura como destinatarios de sus propios reportes/alertas por email. Nunca datos de quien imprime en la impresora — el portal no tiene ninguna vía para saber eso.

| # | Campo | Tipo | Origen | Propósito | Sensibilidad | Quién es la persona |
|---|-------|------|--------|-----------|---------------|----------------------|
| 15 | `users.username` | String | Alta por un admin del portal | Identificar la cuenta de operador | **Media** — suele ser un email o nombre de usuario corporativo | Personal de IT/operaciones del cliente o de STC |
| 16 | `users.password_hash` | String | Hash bcrypt del password elegido | Autenticación | **Alta** — nunca en claro, nunca en `audit_logs` (ver fila 18) | ídem |
| 17 | `users.totp_secret` / recovery codes | String cifrado / hashes SHA-256 | 2FA TOTP opt-in (`modules/two-factor/`) | Segundo factor de autenticación | **Alta** — secreto cifrado at-rest (mismo mecanismo AES-256-GCM/HKDF que credenciales SNMP, ver §2.4); códigos de recuperación sólo se muestran una vez, en reposo van hasheados, nunca en claro | ídem |
| 18 | `audit_logs.user_id` / `ip_address` en cada login | UUID + String (IP) | `POST /portal/login`, cada intento (éxito o falla) | Trazabilidad de acceso — investigar accesos indebidos, fuerza bruta | **Media** — vincula una IP a una cuenta identificada; motivo de la falla queda en `metadata` (nunca la contraseña ni el código 2FA) | ídem — **sin purga automática, ver §6** |
| 19 | `scheduled_reports.recipients` | Array de emails (jsonb) | El propio admin del cliente los configura, para recibir sus reportes | Entrega automática de reportes de facturación | **Alta** — email = dato personal de una persona identificable | Contacto que el CLIENTE eligió (típicamente su propio staff de compras/IT) |
| 20 | `email_log.recipient` | String (email) | Bitácora de cada envío (reportes, alertas, notificaciones) | Diagnóstico de entrega ("¿le llegó el mail a fulano?") | **Alta** — misma razón que la fila 19 | ídem |

**Nunca** hay en el portal: nombres/emails de la persona que retiró una impresión, contenido de ningún documento, ni ningún dato del lado de la impresora que identifique a una persona — el equipo de la impresora no tiene ese concepto, y el agente no lo captura aunque lo tuviera (ver §1 y §3).

---

## 3. Datos Explícitamente NO Recopilados

Sin cambios respecto a v1.5 — el **agente** (no el portal, ver §2.5) **no recopila** ninguno de los siguientes:

| Categoría | Ejemplos | Confirmación técnica |
|-----------|----------|----------------------|
| PII de usuarios finales (quien imprime) | Nombres, emails, DNI, cuentas de dominio | No existe código de acceso a AD/LDAP/SAM. **Distinto** de las cuentas de operador del portal y los emails de destinatarios de reportes — eso SÍ se procesa, ver §2.5, son personas de IT/operaciones del cliente, no usuarios finales |
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

### 4.2 Acciones remotas en bloque (nuevo en v2.1)

Un operador puede programar comandos en bloque hacia agentes o equipos puntuales (rescanear, reiniciar el servicio del agente, forzar actualización, o —desde el agente v1.2.0— **reiniciar la impresora en sí** vía SNMP SET sobre `prtGeneralReset`, RFC 3805). El reinicio de impresora reusa el mismo pool de credenciales SNMP de **lectura** ya configurado — nunca una credencial de escritura separada — y reporta un error explícito (nunca éxito falso) si esa credencial no tiene permiso de escritura en el equipo. Cada comando queda auditado (qué acción, sobre qué agente/equipo, quién la disparó). No involucra ningún dato de personas — es control operativo sobre hardware del cliente, dentro de la misma superficie SNMP que ya usa el resto del agente.

---

## 5. Clasificación de Riesgo de Privacidad

| Riesgo | Nivel | Justificación |
|--------|-------|---------------|
| Exposición de PII de usuarios finales (quien imprime) | **Ninguno** | El agente no accede ni procesa datos de personas del lado de la impresora |
| Exposición de PII de operadores del portal / destinatarios de reportes | **Bajo-Medio** (nuevo, v2.1) | Conjunto acotado de personas identificadas (staff de IT/operaciones del cliente, nunca usuarios finales) — ver §2.5. Passwords siempre hasheadas (bcrypt), 2FA cifrado/hasheado, nunca en claro en `audit_logs`; emails de destinatarios en claro (necesario para entregar el mail), sin purga automática (ver §6) |
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
| `audit_logs` (trail de auditoría, **incluye login de operadores desde v2.1**) | **Sin purga automática** | Decisión de negocio explícita — un trail de auditoría no debe autopurgarse; es write-only, ningún endpoint lo lee de vuelta. Aplica igual al nuevo registro de login (usuario + IP, §2.5) — retenido indefinidamente por diseño |
| `email_log` (bitácora de entrega, incluye `recipient`) | **12 meses** | Job de purga periódico (`retentionJob.ts`, misma ventana que alertas resueltas) |
| `readings_queue` local (agente) | 7 días | Purga automática, sin cambios respecto a v1.5 |
| `known_devices` local (agente) | Indefinida (catálogo) | Sin cambios respecto a v1.5 |
| `users` (cuentas de operador del portal, incluye 2FA) | Mientras la cuenta exista | Se borra al eliminar el usuario del portal (acción de un admin) — no hay purga por antigüedad, es una cuenta activa, no un log |

Estas ventanas son una **decisión de negocio**, no una obligación legal específica documentada — no hay ningún requisito regulatorio que fije un número exacto para este tipo de dato operativo.

---

## 7. Contacto y Responsabilidad

| Rol | Responsabilidad |
|-----|-----------------|
| **Proveedor (STC)** | Custodio de los datos transmitidos al portal; responsable de su almacenamiento y procesamiento; aplica la política de retención de §6 |
| **Cliente (IT Admin)** | Define rangos IP de escaneo; decide si habilita API pública/webhooks y Remote EWS (ambos opt-in); propietario del equipo host del agente |
| **Auditor de privacidad** | Puede solicitar logs de auditoría (`audit_logs` en el servidor, o `C:\ProgramData\STCCloudMonitor\agent.log` local) |

---

*Documento generado a partir del análisis del código fuente de STC Cloud Monitor v2.1 (agosto 2026). Para revisiones o consultas, contactar al equipo de seguridad de STC.*
